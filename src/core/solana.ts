import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
  AccountInfo,
  ParsedAccountData,
} from '@solana/web3.js';
import * as fs from 'fs';
import { getConfig } from '../utils/config';
import log from '../utils/logger';
import { SolanaAccountInfo, AccountType } from '../types';

let connection: Connection | null = null;
let operatorKeypair: Keypair | null = null;

// Known program IDs for account type detection
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

/**
 * Get or create Solana connection
 */
export function getConnection(): Connection {
  if (!connection) {
    const config = getConfig();
    connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.wsUrl,
    });
    log.info('Solana connection established', { 
      rpc: config.rpcUrl,
      network: config.network 
    });
  }
  return connection;
}

/**
 * Load the operator keypair from file
 */
export function loadOperatorKeypair(): Keypair {
  if (operatorKeypair) {
    return operatorKeypair;
  }

  const config = getConfig();
  
  if (!fs.existsSync(config.operatorKeypairPath)) {
    throw new Error(`Keypair file not found: ${config.operatorKeypairPath}`);
  }

  const keypairData = JSON.parse(fs.readFileSync(config.operatorKeypairPath, 'utf-8'));
  operatorKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  
  log.info('Operator keypair loaded', { 
    pubkey: operatorKeypair.publicKey.toBase58() 
  });

  return operatorKeypair;
}

/**
 * Get the treasury public key (defaults to operator wallet)
 */
export function getTreasuryPubkey(): PublicKey {
  const config = getConfig();
  
  if (config.treasuryPubkey) {
    return new PublicKey(config.treasuryPubkey);
  }
  
  return loadOperatorKeypair().publicKey;
}

/**
 * Get account info with extended details
 */
export async function getAccountInfo(pubkey: string | PublicKey): Promise<SolanaAccountInfo> {
  const conn = getConnection();
  const pk = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
  
  const info = await conn.getAccountInfo(pk);
  
  return {
    pubkey: pk,
    lamports: info?.lamports ?? 0,
    owner: info?.owner ?? SYSTEM_PROGRAM_ID,
    executable: info?.executable ?? false,
    rentEpoch: info?.rentEpoch ?? 0,
    dataSize: info?.data.length ?? 0,
    exists: info !== null,
  };
}

/**
 * Check if an account exists on-chain
 */
export async function accountExists(pubkey: string | PublicKey): Promise<boolean> {
  const info = await getAccountInfo(pubkey);
  return info.exists;
}

/**
 * Get the current balance of an account in lamports
 */
export async function getBalance(pubkey: string | PublicKey): Promise<number> {
  const conn = getConnection();
  const pk = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
  return conn.getBalance(pk);
}

/**
 * Get the minimum rent exemption for a given data size
 */
export async function getMinRentExemption(dataSize: number): Promise<number> {
  const conn = getConnection();
  return conn.getMinimumBalanceForRentExemption(dataSize);
}

/**
 * Determine the type of account based on its owner program
 */
export function detectAccountType(owner: PublicKey): AccountType {
  const ownerStr = owner.toBase58();
  
  if (ownerStr === TOKEN_PROGRAM_ID.toBase58() || ownerStr === TOKEN_2022_PROGRAM_ID.toBase58()) {
    return AccountType.TOKEN_ACCOUNT;
  }
  
  if (ownerStr === ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()) {
    return AccountType.ASSOCIATED_TOKEN;
  }
  
  if (ownerStr === SYSTEM_PROGRAM_ID.toBase58()) {
    return AccountType.SYSTEM;
  }
  
  return AccountType.PROGRAM_DATA;
}

/**
 * Get multiple accounts info in batch
 */
export async function getMultipleAccountsInfo(
  pubkeys: (string | PublicKey)[]
): Promise<Map<string, SolanaAccountInfo>> {
  const conn = getConnection();
  const pks = pubkeys.map(pk => typeof pk === 'string' ? new PublicKey(pk) : pk);
  
  const results = new Map<string, SolanaAccountInfo>();
  
  // Process in batches of 100 (Solana RPC limit)
  const batchSize = 100;
  for (let i = 0; i < pks.length; i += batchSize) {
    const batch = pks.slice(i, i + batchSize);
    const infos = await conn.getMultipleAccountsInfo(batch);
    
    batch.forEach((pk, idx) => {
      const info = infos[idx];
      results.set(pk.toBase58(), {
        pubkey: pk,
        lamports: info?.lamports ?? 0,
        owner: info?.owner ?? SYSTEM_PROGRAM_ID,
        executable: info?.executable ?? false,
        rentEpoch: info?.rentEpoch ?? 0,
        dataSize: info?.data.length ?? 0,
        exists: info !== null,
      });
    });
  }
  
  return results;
}

/**
 * Get recent transactions for an account
 */
export async function getRecentTransactions(
  pubkey: string | PublicKey,
  limit: number = 20
): Promise<string[]> {
  const conn = getConnection();
  const pk = typeof pubkey === 'string' ? new PublicKey(pubkey) : pubkey;
  
  const signatures = await conn.getSignaturesForAddress(pk, { limit });
  return signatures.map(sig => sig.signature);
}

/**
 * Get transaction signatures involving an account as fee payer (sponsor)
 */
export async function getSponsoredAccountSignatures(
  sponsorPubkey: string | PublicKey,
  limit: number = 1000
): Promise<{ signature: string; slot: number; blockTime: number | null }[]> {
  const conn = getConnection();
  const pk = typeof sponsorPubkey === 'string' ? new PublicKey(sponsorPubkey) : sponsorPubkey;
  
  const signatures = await conn.getSignaturesForAddress(pk, { limit });
  
  return signatures.map(sig => ({
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime ?? null,
  }));
}

/**
 * Get all token accounts owned by an address
 */
export async function getTokenAccounts(
  ownerPubkey: string | PublicKey
): Promise<{ pubkey: PublicKey; mint: PublicKey; amount: bigint }[]> {
  const conn = getConnection();
  const pk = typeof ownerPubkey === 'string' ? new PublicKey(ownerPubkey) : ownerPubkey;
  
  const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pk, {
    programId: TOKEN_PROGRAM_ID,
  });
  
  return tokenAccounts.value.map(account => {
    const parsed = account.account.data as ParsedAccountData;
    return {
      pubkey: account.pubkey,
      mint: new PublicKey(parsed.parsed.info.mint),
      amount: BigInt(parsed.parsed.info.tokenAmount.amount),
    };
  });
}

/**
 * Transfer SOL from one account to another
 */
export async function transferSol(
  from: Keypair,
  to: PublicKey,
  lamports: number,
  dryRun: boolean = true
): Promise<{ signature: string; success: boolean; error?: string }> {
  if (dryRun) {
    log.transaction('DRY RUN: Would transfer SOL', {
      from: from.publicKey.toBase58(),
      to: to.toBase58(),
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
    });
    return { signature: 'dry-run-signature', success: true };
  }

  try {
    const conn = getConnection();
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: to,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(conn, transaction, [from], {
      commitment: 'confirmed',
    });

    log.transaction('SOL transfer successful', {
      signature,
      from: from.publicKey.toBase58(),
      to: to.toBase58(),
      lamports,
    });

    return { signature, success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('SOL transfer failed', { error: errorMsg });
    return { signature: '', success: false, error: errorMsg };
  }
}

/**
 * Close an account and reclaim rent to destination
 */
export async function closeAccountAndReclaimRent(
  account: PublicKey,
  destination: PublicKey,
  authority: Keypair,
  dryRun: boolean = true
): Promise<{ signature: string; success: boolean; lamportsReclaimed: number; error?: string }> {
  const conn = getConnection();
  
  // Get current account info
  const accountInfo = await getAccountInfo(account);
  
  if (!accountInfo.exists) {
    return {
      signature: '',
      success: false,
      lamportsReclaimed: 0,
      error: 'Account does not exist or already closed',
    };
  }

  const lamportsToReclaim = accountInfo.lamports;

  if (dryRun) {
    log.transaction('DRY RUN: Would close account and reclaim rent', {
      account: account.toBase58(),
      destination: destination.toBase58(),
      lamportsToReclaim,
      sol: lamportsToReclaim / LAMPORTS_PER_SOL,
    });
    return {
      signature: 'dry-run-signature',
      success: true,
      lamportsReclaimed: lamportsToReclaim,
    };
  }

  try {
    // For system accounts, we can use a simple transfer
    // For program-owned accounts, we need the program's close instruction
    if (accountInfo.owner.equals(SYSTEM_PROGRAM_ID)) {
      // System account - transfer all lamports
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: account,
          toPubkey: destination,
          lamports: lamportsToReclaim,
        })
      );

      const signature = await sendAndConfirmTransaction(conn, transaction, [authority], {
        commitment: 'confirmed',
      });

      log.transaction('Account closed and rent reclaimed', {
        signature,
        account: account.toBase58(),
        lamportsReclaimed: lamportsToReclaim,
      });

      return {
        signature,
        success: true,
        lamportsReclaimed: lamportsToReclaim,
      };
    } else {
      // Program-owned account - need specific close instruction
      // This is a placeholder - actual implementation depends on the program
      return {
        signature: '',
        success: false,
        lamportsReclaimed: 0,
        error: `Cannot close program-owned account (owner: ${accountInfo.owner.toBase58()}). Manual intervention required.`,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('Failed to close account', { error: errorMsg, account: account.toBase58() });
    return {
      signature: '',
      success: false,
      lamportsReclaimed: 0,
      error: errorMsg,
    };
  }
}

/**
 * Get current network status
 */
export async function getNetworkStatus(): Promise<{
  slot: number;
  blockHeight: number;
  epochInfo: { epoch: number; slotIndex: number; slotsInEpoch: number };
}> {
  const conn = getConnection();
  
  const [slot, blockHeight, epochInfo] = await Promise.all([
    conn.getSlot(),
    conn.getBlockHeight(),
    conn.getEpochInfo(),
  ]);

  return {
    slot,
    blockHeight,
    epochInfo: {
      epoch: epochInfo.epoch,
      slotIndex: epochInfo.slotIndex,
      slotsInEpoch: epochInfo.slotsInEpoch,
    },
  };
}

/**
 * Format a public key for display (shortened)
 */
export function shortenPubkey(pubkey: string | PublicKey, chars: number = 4): string {
  const str = typeof pubkey === 'string' ? pubkey : pubkey.toBase58();
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/**
 * Get explorer URL for a transaction or account
 */
export function getExplorerUrl(
  type: 'tx' | 'address',
  value: string,
  network: 'devnet' | 'mainnet-beta' | 'testnet' = 'devnet'
): string {
  const base = 'https://explorer.solana.com';
  const cluster = network === 'mainnet-beta' ? '' : `?cluster=${network}`;
  return `${base}/${type}/${value}${cluster}`;
}

export default {
  getConnection,
  loadOperatorKeypair,
  getTreasuryPubkey,
  getAccountInfo,
  accountExists,
  getBalance,
  getMinRentExemption,
  detectAccountType,
  getMultipleAccountsInfo,
  getRecentTransactions,
  getSponsoredAccountSignatures,
  getTokenAccounts,
  transferSol,
  closeAccountAndReclaimRent,
  getNetworkStatus,
  shortenPubkey,
  getExplorerUrl,
};
