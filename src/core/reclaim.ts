import { PublicKey } from '@solana/web3.js';
import {
  getAccountInfo,
  loadOperatorKeypair,
  getTreasuryPubkey,
  closeAccountAndReclaimRent,
  transferSol,
  getExplorerUrl,
} from './solana';
import {
  getAccount,
  updateAccountStatus,
  updateAccountRent,
  recordReclaimTransaction,
  isWhitelisted,
  isBlacklisted,
  getEligibleAccounts,
} from './database';
import {
  TrackedAccount,
  AccountStatus,
  ReclaimResult,
  BatchReclaimSummary,
  EligibilityCheck,
} from '../types';
import { getConfig } from '../utils/config';
import log from '../utils/logger';

/**
 * Check if an account is eligible for rent reclaim
 */
export async function checkEligibility(pubkey: string): Promise<EligibilityCheck> {
  const config = getConfig();
  const result: EligibilityCheck = {
    eligible: true,
    account: {} as TrackedAccount,
    reasons: [],
    warnings: [],
  };

  // Check if account is tracked
  const account = getAccount(pubkey);
  if (!account) {
    result.eligible = false;
    result.reasons.push('Account is not tracked in the database');
    return result;
  }
  result.account = account;

  // Check if already reclaimed
  if (account.status === AccountStatus.RECLAIMED) {
    result.eligible = false;
    result.reasons.push('Account has already been reclaimed');
    return result;
  }

  // Check whitelist
  if (isWhitelisted(pubkey)) {
    result.eligible = false;
    result.reasons.push('Account is whitelisted (protected from reclaim)');
    return result;
  }

  // Check blacklist
  if (isBlacklisted(pubkey)) {
    result.eligible = false;
    result.reasons.push('Account is blacklisted');
    return result;
  }

  // Check on-chain status
  const onChainInfo = await getAccountInfo(pubkey);
  
  if (onChainInfo.exists) {
    // Account still exists - check if it's close to empty
    if (onChainInfo.lamports > 0) {
      result.warnings.push(`Account still has ${onChainInfo.lamports} lamports on-chain`);
      
      // If account still has significant balance, it's not ready for reclaim
      // unless it's a token account that was closed but rent remains
      if (onChainInfo.lamports >= config.minReclaimLamports) {
        result.eligible = false;
        result.reasons.push('Account still has balance and is not closed');
        return result;
      }
    }
  } else {
    // Account doesn't exist on-chain anymore
    if (account.status !== AccountStatus.CLOSED) {
      // Update status in database
      updateAccountStatus(pubkey, AccountStatus.CLOSED, new Date());
      account.status = AccountStatus.CLOSED;
      result.warnings.push('Account status updated to CLOSED');
    }
    
    // If account is closed, there's nothing to reclaim
    if (account.rentLamports === 0) {
      result.eligible = false;
      result.reasons.push('Account has no remaining rent to reclaim');
      return result;
    }
  }

  // Check dormancy period
  if (account.closedAt) {
    const daysSinceClosed = Math.floor(
      (Date.now() - account.closedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceClosed < config.minDormancyDays) {
      result.eligible = false;
      result.reasons.push(
        `Account was closed ${daysSinceClosed} days ago. ` +
        `Minimum dormancy period is ${config.minDormancyDays} days.`
      );
      return result;
    }
  }

  // Check minimum lamports threshold
  if (account.rentLamports < config.minReclaimLamports) {
    result.eligible = false;
    result.reasons.push(
      `Account has ${account.rentLamports} lamports. ` +
      `Minimum threshold is ${config.minReclaimLamports} lamports.`
    );
    return result;
  }

  // All checks passed
  result.reasons.push('Account is eligible for rent reclaim');
  return result;
}

/**
 * Reclaim rent from a single account
 */
export async function reclaimSingleAccount(
  pubkey: string,
  forceDryRun?: boolean
): Promise<ReclaimResult> {
  const config = getConfig();
  const dryRun = forceDryRun !== undefined ? forceDryRun : config.dryRun;

  log.reclaim(`Starting reclaim for account: ${pubkey}`, { dryRun });

  // Check eligibility first
  const eligibility = await checkEligibility(pubkey);
  
  if (!eligibility.eligible) {
    log.reclaim(`Account not eligible: ${eligibility.reasons.join(', ')}`);
    return {
      success: false,
      accountPubkey: pubkey,
      error: eligibility.reasons.join('; '),
      dryRun,
    };
  }

  const account = eligibility.account;
  const treasuryPubkey = getTreasuryPubkey();
  
  try {
    // Get current on-chain info
    const onChainInfo = await getAccountInfo(pubkey);
    const lamportsToReclaim = onChainInfo.exists ? onChainInfo.lamports : account.rentLamports;

    if (lamportsToReclaim === 0) {
      return {
        success: false,
        accountPubkey: pubkey,
        error: 'No lamports to reclaim',
        dryRun,
      };
    }

    // Perform the reclaim
    const operatorKeypair = loadOperatorKeypair();
    
    const reclaimResult = await closeAccountAndReclaimRent(
      new PublicKey(pubkey),
      treasuryPubkey,
      operatorKeypair,
      dryRun
    );

    if (reclaimResult.success) {
      // Record the transaction
      recordReclaimTransaction({
        accountPubkey: pubkey,
        txSignature: reclaimResult.signature,
        lamportsReclaimed: reclaimResult.lamportsReclaimed,
        reclaimedAt: new Date(),
        success: true,
        treasuryPubkey: treasuryPubkey.toBase58(),
      });

      // Update account status
      if (!dryRun) {
        updateAccountStatus(pubkey, AccountStatus.RECLAIMED);
        updateAccountRent(pubkey, 0);
      }

      log.reclaim(`Reclaim successful`, {
        pubkey,
        lamports: reclaimResult.lamportsReclaimed,
        signature: reclaimResult.signature,
        dryRun,
      });

      return {
        success: true,
        accountPubkey: pubkey,
        txSignature: reclaimResult.signature,
        lamportsReclaimed: reclaimResult.lamportsReclaimed,
        dryRun,
      };
    } else {
      // Record failed transaction
      recordReclaimTransaction({
        accountPubkey: pubkey,
        txSignature: reclaimResult.signature || 'failed',
        lamportsReclaimed: 0,
        reclaimedAt: new Date(),
        success: false,
        errorMessage: reclaimResult.error,
        treasuryPubkey: treasuryPubkey.toBase58(),
      });

      log.reclaim(`Reclaim failed: ${reclaimResult.error}`, { pubkey });

      return {
        success: false,
        accountPubkey: pubkey,
        error: reclaimResult.error,
        dryRun,
      };
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Reclaim error for ${pubkey}: ${errorMsg}`);
    
    return {
      success: false,
      accountPubkey: pubkey,
      error: errorMsg,
      dryRun,
    };
  }
}

/**
 * Reclaim rent from all eligible accounts
 */
export async function reclaimAllEligible(
  forceDryRun?: boolean
): Promise<BatchReclaimSummary> {
  const config = getConfig();
  const dryRun = forceDryRun !== undefined ? forceDryRun : config.dryRun;

  log.reclaim(`Starting batch reclaim of all eligible accounts`, { dryRun });

  const summary: BatchReclaimSummary = {
    totalEligible: 0,
    totalAttempted: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    totalLamportsReclaimed: 0,
    results: [],
    dryRun,
  };

  try {
    // Get all eligible accounts
    const eligibleAccounts = getEligibleAccounts(
      config.minDormancyDays,
      config.minReclaimLamports
    );

    summary.totalEligible = eligibleAccounts.length;
    log.reclaim(`Found ${eligibleAccounts.length} eligible accounts`);

    if (eligibleAccounts.length === 0) {
      return summary;
    }

    // Process each account
    for (const account of eligibleAccounts) {
      summary.totalAttempted++;
      
      const result = await reclaimSingleAccount(account.pubkey, dryRun);
      summary.results.push(result);

      if (result.success) {
        summary.totalSuccessful++;
        summary.totalLamportsReclaimed += result.lamportsReclaimed || 0;
      } else {
        summary.totalFailed++;
      }

      // Add small delay between transactions to avoid rate limiting
      if (!dryRun) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    log.reclaim(`Batch reclaim complete`, {
      eligible: summary.totalEligible,
      attempted: summary.totalAttempted,
      successful: summary.totalSuccessful,
      failed: summary.totalFailed,
      lamportsReclaimed: summary.totalLamportsReclaimed,
      dryRun,
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(`Batch reclaim error: ${errorMsg}`);
  }

  return summary;
}

/**
 * Reclaim rent from specific accounts
 */
export async function reclaimMultiple(
  pubkeys: string[],
  forceDryRun?: boolean
): Promise<BatchReclaimSummary> {
  const config = getConfig();
  const dryRun = forceDryRun !== undefined ? forceDryRun : config.dryRun;

  log.reclaim(`Starting reclaim for ${pubkeys.length} accounts`, { dryRun });

  const summary: BatchReclaimSummary = {
    totalEligible: pubkeys.length,
    totalAttempted: 0,
    totalSuccessful: 0,
    totalFailed: 0,
    totalLamportsReclaimed: 0,
    results: [],
    dryRun,
  };

  for (const pubkey of pubkeys) {
    summary.totalAttempted++;
    
    const result = await reclaimSingleAccount(pubkey, dryRun);
    summary.results.push(result);

    if (result.success) {
      summary.totalSuccessful++;
      summary.totalLamportsReclaimed += result.lamportsReclaimed || 0;
    } else {
      summary.totalFailed++;
    }

    // Add small delay between transactions
    if (!dryRun) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  log.reclaim(`Multiple reclaim complete`, {
    attempted: summary.totalAttempted,
    successful: summary.totalSuccessful,
    failed: summary.totalFailed,
    lamportsReclaimed: summary.totalLamportsReclaimed,
    dryRun,
  });

  return summary;
}

/**
 * Generate a reclaim report
 */
export interface ReclaimReport {
  generatedAt: Date;
  network: string;
  treasuryPubkey: string;
  summary: {
    totalEligible: number;
    totalReclaimable: number; // in lamports
    totalReclaimed: number;   // in lamports
    successRate: number;      // percentage
  };
  eligibleAccounts: Array<{
    pubkey: string;
    rentLamports: number;
    closedAt?: Date;
    daysClosed: number;
  }>;
}

/**
 * Generate a report of reclaimable accounts
 */
export function generateReclaimReport(): ReclaimReport {
  const config = getConfig();
  const eligibleAccounts = getEligibleAccounts(
    config.minDormancyDays,
    config.minReclaimLamports
  );

  const now = Date.now();

  const report: ReclaimReport = {
    generatedAt: new Date(),
    network: config.network,
    treasuryPubkey: getTreasuryPubkey().toBase58(),
    summary: {
      totalEligible: eligibleAccounts.length,
      totalReclaimable: eligibleAccounts.reduce((sum, a) => sum + a.rentLamports, 0),
      totalReclaimed: 0, // Would need to sum from reclaim transactions
      successRate: 0,
    },
    eligibleAccounts: eligibleAccounts.map(account => ({
      pubkey: account.pubkey,
      rentLamports: account.rentLamports,
      closedAt: account.closedAt,
      daysClosed: account.closedAt 
        ? Math.floor((now - account.closedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    })),
  };

  return report;
}

export default {
  checkEligibility,
  reclaimSingleAccount,
  reclaimAllEligible,
  reclaimMultiple,
  generateReclaimReport,
};
