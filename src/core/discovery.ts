import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import {
  getConnection,
  getSponsoredAccountSignatures,
  getAccountInfo,
  getMultipleAccountsInfo,
  detectAccountType,
} from './solana';
import {
  upsertAccount,
  getAccount,
} from './database';
import {
  TrackedAccount,
  AccountStatus,
  AccountType,
  DiscoveryResult,
} from '../types';
import { getConfig } from '../utils/config';
import log from '../utils/logger';

/**
 * Discover accounts sponsored by a Kora node
 * 
 * This analyzes transaction history to find accounts that were created
 * with the Kora node as the fee payer (sponsor).
 */
export async function discoverSponsoredAccounts(
  koraSignerPubkey?: string,
  limit: number = 1000
): Promise<DiscoveryResult> {
  const config = getConfig();
  const sponsorPubkey = koraSignerPubkey || config.koraSignerPubkey;

  if (!sponsorPubkey) {
    return {
      totalFound: 0,
      newAccounts: 0,
      existingAccounts: 0,
      accounts: [],
      errors: [
        'Kora signer public key not configured.',
        'Option 1: Set KORA_SIGNER_PUBKEY in .env (your signer address from signers.toml)',
        'Option 2: Set KORA_RPC_URL in .env and run: npm run cli -- kora-info',
        'Option 3: Pass it directly: npm run cli -- discover --signer <PUBKEY>',
      ],
    };
  }

  log.discovery(`Starting account discovery for Kora node: ${sponsorPubkey}`);
  
  const result: DiscoveryResult = {
    totalFound: 0,
    newAccounts: 0,
    existingAccounts: 0,
    accounts: [],
    errors: [],
  };

  try {
    // Get recent transaction signatures from the sponsor
    const signatures = await getSponsoredAccountSignatures(sponsorPubkey, limit);
    log.discovery(`Found ${signatures.length} transactions from sponsor`);

    // Analyze transactions one at a time with rate limiting (public RPC friendly)
    const conn = getConnection();
    const delayBetweenRequests = 500; // 500ms delay between requests
    const discoveredPubkeys = new Set<string>();

    for (let i = 0; i < signatures.length; i++) {
      const sigInfo = signatures[i];
      
      // Add delay between requests to avoid rate limiting
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }

      log.discovery(`Processing transaction ${i + 1}/${signatures.length}: ${sigInfo.signature.slice(0, 20)}...`);

      try {
        const tx = await conn.getParsedTransaction(
          sigInfo.signature,
          { maxSupportedTransactionVersion: 0 }
        );
        
        if (!tx || tx.meta?.err) continue;

        // Find accounts that were created in this transaction
        const createdAccounts = findCreatedAccounts(tx, sponsorPubkey);
        
        for (const accountPubkey of createdAccounts) {
          if (discoveredPubkeys.has(accountPubkey)) continue;
          discoveredPubkeys.add(accountPubkey);

          try {
            // Check if we already track this account
            const existing = getAccount(accountPubkey);
            
            if (existing) {
              result.existingAccounts++;
              result.accounts.push(existing);
              continue;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 300));

            // Get current account info
            const accountInfo = await getAccountInfo(accountPubkey);
            
            const trackedAccount: Omit<TrackedAccount, 'id'> = {
              pubkey: accountPubkey,
              createdAt: sigInfo.blockTime 
                ? new Date(sigInfo.blockTime * 1000) 
                : new Date(),
              sponsoredTxSignature: sigInfo.signature,
              accountType: accountInfo.exists 
                ? detectAccountType(accountInfo.owner) 
                : AccountType.UNKNOWN,
              rentLamports: accountInfo.lamports,
              status: accountInfo.exists 
                ? AccountStatus.ACTIVE 
                : AccountStatus.CLOSED,
              lastCheckedAt: new Date(),
              closedAt: accountInfo.exists ? undefined : new Date(),
              programOwner: accountInfo.exists ? accountInfo.owner.toBase58() : undefined,
              dataSize: accountInfo.dataSize,
            };

            const saved = upsertAccount(trackedAccount);
            result.newAccounts++;
            result.accounts.push(saved);
            
            log.discovery(`Discovered account: ${accountPubkey}`, {
              type: trackedAccount.accountType,
              status: trackedAccount.status,
              rent: trackedAccount.rentLamports,
            });

          } catch (error) {
            const errorMsg = `Error processing account ${accountPubkey}: ${error}`;
            result.errors.push(errorMsg);
            log.error(errorMsg);
          }
        }
      } catch (txError) {
        log.warn(`Failed to fetch transaction ${sigInfo.signature}: ${txError}`);
        result.errors.push(`Transaction fetch failed: ${sigInfo.signature.slice(0, 20)}...`);
      }
    }

    result.totalFound = result.newAccounts + result.existingAccounts;
    
    log.discovery(`Discovery complete`, {
      total: result.totalFound,
      new: result.newAccounts,
      existing: result.existingAccounts,
      errors: result.errors.length,
    });

  } catch (error) {
    const errorMsg = `Discovery failed: ${error}`;
    result.errors.push(errorMsg);
    log.error(errorMsg);
  }

  return result;
}

/**
 * Find accounts that were created in a transaction
 * 
 * Kora sponsorship typically involves the sponsor paying for:
 * - Account creation (system program allocate/create)
 * - Token account initialization
 * - Associated token account creation
 */
function findCreatedAccounts(
  tx: ParsedTransactionWithMeta,
  sponsorPubkey: string
): string[] {
  const createdAccounts: string[] = [];
  const sponsorPk = new PublicKey(sponsorPubkey);

  // Check if this transaction was paid for by the sponsor
  const feePayer = tx.transaction.message.accountKeys[0];
  if (!feePayer.pubkey.equals(sponsorPk)) {
    return [];
  }

  // Look for account creation patterns
  if (tx.meta?.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        if ('parsed' in ix) {
          const parsed = ix as any;
          
          // System program create account
          if (parsed.program === 'system' && parsed.parsed?.type === 'createAccount') {
            const newAccount = parsed.parsed.info?.newAccount;
            if (newAccount && newAccount !== sponsorPubkey) {
              createdAccounts.push(newAccount);
            }
          }
          
          // SPL Token initialize account
          if (parsed.program === 'spl-token' && 
              (parsed.parsed?.type === 'initializeAccount' || 
               parsed.parsed?.type === 'initializeAccount2' ||
               parsed.parsed?.type === 'initializeAccount3')) {
            const account = parsed.parsed.info?.account;
            if (account && account !== sponsorPubkey) {
              createdAccounts.push(account);
            }
          }

          // Associated token account creation
          if (parsed.program === 'spl-associated-token-account' && 
              parsed.parsed?.type === 'create') {
            const account = parsed.parsed.info?.account;
            if (account && account !== sponsorPubkey) {
              createdAccounts.push(account);
            }
          }
        }
      }
    }
  }

  // Also check top-level instructions
  for (const ix of tx.transaction.message.instructions) {
    if ('parsed' in ix) {
      const parsed = ix as any;
      
      if (parsed.program === 'system' && parsed.parsed?.type === 'createAccount') {
        const newAccount = parsed.parsed.info?.newAccount;
        if (newAccount && newAccount !== sponsorPubkey) {
          createdAccounts.push(newAccount);
        }
      }
    }
  }

  // Check post token balances for new accounts
  if (tx.meta?.postTokenBalances) {
    for (const balance of tx.meta.postTokenBalances) {
      const accountKeys = tx.transaction.message.accountKeys;
      if (balance.accountIndex < accountKeys.length) {
        const accountPubkey = accountKeys[balance.accountIndex].pubkey.toBase58();
        if (accountPubkey !== sponsorPubkey && !createdAccounts.includes(accountPubkey)) {
          // Check if this might be a newly created token account
          const preBalance = tx.meta.preTokenBalances?.find(
            (pb: { accountIndex: number }) => pb.accountIndex === balance.accountIndex
          );
          if (!preBalance) {
            createdAccounts.push(accountPubkey);
          }
        }
      }
    }
  }

  return [...new Set(createdAccounts)]; // Remove duplicates
}

/**
 * Add accounts manually by public key
 * Useful for adding accounts that weren't discovered through transaction history
 */
export async function addAccountManually(
  pubkey: string,
  sponsoredTxSignature?: string
): Promise<TrackedAccount | null> {
  try {
    // Validate public key
    const pk = new PublicKey(pubkey);
    
    // Check if already tracked
    const existing = getAccount(pubkey);
    if (existing) {
      log.discovery(`Account already tracked: ${pubkey}`);
      return existing;
    }

    // Get account info
    const accountInfo = await getAccountInfo(pk);
    
    const trackedAccount: Omit<TrackedAccount, 'id'> = {
      pubkey,
      createdAt: new Date(),
      sponsoredTxSignature: sponsoredTxSignature || 'manual-add',
      accountType: accountInfo.exists 
        ? detectAccountType(accountInfo.owner) 
        : AccountType.UNKNOWN,
      rentLamports: accountInfo.lamports,
      status: accountInfo.exists 
        ? AccountStatus.ACTIVE 
        : AccountStatus.CLOSED,
      lastCheckedAt: new Date(),
      closedAt: accountInfo.exists ? undefined : new Date(),
      programOwner: accountInfo.exists ? accountInfo.owner.toBase58() : undefined,
      dataSize: accountInfo.dataSize,
      notes: 'Manually added',
    };

    const saved = upsertAccount(trackedAccount);
    log.discovery(`Manually added account: ${pubkey}`, {
      type: trackedAccount.accountType,
      status: trackedAccount.status,
    });

    return saved;

  } catch (error) {
    log.error(`Failed to add account manually: ${error}`);
    return null;
  }
}

/**
 * Bulk add accounts from a list
 */
export async function addAccountsBulk(pubkeys: string[]): Promise<{
  added: number;
  skipped: number;
  errors: string[];
}> {
  const result = {
    added: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const pubkey of pubkeys) {
    try {
      const account = await addAccountManually(pubkey);
      if (account) {
        result.added++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors.push(`${pubkey}: ${error}`);
    }
  }

  log.discovery(`Bulk add complete`, result);
  return result;
}

export default {
  discoverSponsoredAccounts,
  addAccountManually,
  addAccountsBulk,
};
