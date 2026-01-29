import {
  getAccountInfo,
  getMultipleAccountsInfo,
} from './solana';
import {
  getAccounts,
  updateAccountStatus,
  updateAccountRent,
  getAccount,
} from './database';
import {
  TrackedAccount,
  AccountStatus,
  AccountFilter,
} from '../types';
import { getConfig } from '../utils/config';
import log from '../utils/logger';

/**
 * Result of a monitoring check
 */
export interface MonitorResult {
  totalChecked: number;
  statusChanges: StatusChange[];
  errors: string[];
  duration: number; // in milliseconds
}

/**
 * Represents a status change for an account
 */
export interface StatusChange {
  pubkey: string;
  previousStatus: AccountStatus;
  newStatus: AccountStatus;
  previousRent: number;
  newRent: number;
  reason: string;
}

/**
 * Check all active accounts for status changes
 */
export async function checkAllAccounts(): Promise<MonitorResult> {
  const startTime = Date.now();
  
  const result: MonitorResult = {
    totalChecked: 0,
    statusChanges: [],
    errors: [],
    duration: 0,
  };

  try {
    // Get all accounts that need monitoring (active and inactive)
    const accountsToCheck = getAccounts({
      status: [AccountStatus.ACTIVE, AccountStatus.INACTIVE],
    });

    if (accountsToCheck.length === 0) {
      log.monitor('No accounts to check');
      result.duration = Date.now() - startTime;
      return result;
    }

    log.monitor(`Checking ${accountsToCheck.length} accounts`);

    // Batch check accounts
    const pubkeys = accountsToCheck.map(a => a.pubkey);
    const accountInfos = await getMultipleAccountsInfo(pubkeys);

    for (const account of accountsToCheck) {
      result.totalChecked++;
      
      try {
        const onChainInfo = accountInfos.get(account.pubkey);
        
        if (!onChainInfo) {
          result.errors.push(`No info returned for ${account.pubkey}`);
          continue;
        }

        // Check for status changes
        const statusChange = detectStatusChange(account, onChainInfo);
        
        if (statusChange) {
          result.statusChanges.push(statusChange);
          
          // Update database
          updateAccountStatus(
            account.pubkey, 
            statusChange.newStatus,
            statusChange.newStatus === AccountStatus.CLOSED ? new Date() : undefined
          );
          
          if (statusChange.newRent !== statusChange.previousRent) {
            updateAccountRent(account.pubkey, statusChange.newRent);
          }
          
          log.monitor(`Status change detected`, {
            pubkey: account.pubkey,
            from: statusChange.previousStatus,
            to: statusChange.newStatus,
            reason: statusChange.reason,
          });
        } else {
          // Update last checked time and rent if changed
          if (onChainInfo.lamports !== account.rentLamports) {
            updateAccountRent(account.pubkey, onChainInfo.lamports);
          }
        }

      } catch (error) {
        const errorMsg = `Error checking ${account.pubkey}: ${error}`;
        result.errors.push(errorMsg);
        log.error(errorMsg);
      }
    }

    result.duration = Date.now() - startTime;
    
    log.monitor(`Check complete`, {
      checked: result.totalChecked,
      changes: result.statusChanges.length,
      errors: result.errors.length,
      durationMs: result.duration,
    });

  } catch (error) {
    const errorMsg = `Monitor check failed: ${error}`;
    result.errors.push(errorMsg);
    log.error(errorMsg);
  }

  return result;
}

/**
 * Check a single account for status changes
 */
export async function checkSingleAccount(pubkey: string): Promise<StatusChange | null> {
  const account = getAccount(pubkey);
  
  if (!account) {
    log.error(`Account not found in database: ${pubkey}`);
    return null;
  }

  try {
    const onChainInfo = await getAccountInfo(pubkey);
    const statusChange = detectStatusChange(account, onChainInfo);
    
    if (statusChange) {
      updateAccountStatus(
        pubkey, 
        statusChange.newStatus,
        statusChange.newStatus === AccountStatus.CLOSED ? new Date() : undefined
      );
      
      if (statusChange.newRent !== statusChange.previousRent) {
        updateAccountRent(pubkey, statusChange.newRent);
      }
      
      log.monitor(`Single account check - status change`, {
        pubkey,
        from: statusChange.previousStatus,
        to: statusChange.newStatus,
      });
    }
    
    return statusChange;

  } catch (error) {
    log.error(`Failed to check account ${pubkey}: ${error}`);
    return null;
  }
}

/**
 * Detect if an account's status has changed
 */
function detectStatusChange(
  tracked: TrackedAccount,
  onChain: { exists: boolean; lamports: number }
): StatusChange | null {
  
  // Skip already reclaimed or whitelisted accounts
  if (tracked.status === AccountStatus.RECLAIMED || 
      tracked.status === AccountStatus.WHITELISTED) {
    return null;
  }

  // Account was closed (no longer exists on-chain)
  if (!onChain.exists && tracked.status !== AccountStatus.CLOSED) {
    return {
      pubkey: tracked.pubkey,
      previousStatus: tracked.status,
      newStatus: AccountStatus.CLOSED,
      previousRent: tracked.rentLamports,
      newRent: 0,
      reason: 'Account no longer exists on-chain',
    };
  }

  // Account was reopened (exists but was marked closed)
  if (onChain.exists && tracked.status === AccountStatus.CLOSED) {
    return {
      pubkey: tracked.pubkey,
      previousStatus: tracked.status,
      newStatus: AccountStatus.ACTIVE,
      previousRent: tracked.rentLamports,
      newRent: onChain.lamports,
      reason: 'Account was reopened or recreated',
    };
  }

  // Account balance dropped significantly (might indicate partial closure or drain)
  if (onChain.exists && 
      tracked.status === AccountStatus.ACTIVE &&
      onChain.lamports < tracked.rentLamports * 0.1) {
    return {
      pubkey: tracked.pubkey,
      previousStatus: tracked.status,
      newStatus: AccountStatus.INACTIVE,
      previousRent: tracked.rentLamports,
      newRent: onChain.lamports,
      reason: 'Account balance significantly reduced',
    };
  }

  // No status change, but rent might have changed
  if (onChain.lamports !== tracked.rentLamports) {
    // Just update rent, no status change
    return null;
  }

  return null;
}

/**
 * Get accounts that are ready for reclaim
 */
export function getAccountsReadyForReclaim(): TrackedAccount[] {
  const config = getConfig();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.minDormancyDays);

  const accounts = getAccounts({
    status: [AccountStatus.CLOSED],
    minRentLamports: config.minReclaimLamports,
    closedBefore: cutoffDate,
  });

  log.monitor(`Found ${accounts.length} accounts ready for reclaim`);
  return accounts;
}

/**
 * Summary of current monitoring state
 */
export interface MonitorSummary {
  totalTracked: number;
  byStatus: Record<AccountStatus, number>;
  totalRentLocked: number;
  reclaimableRent: number;
  lastCheckTime?: Date;
}

/**
 * Get a summary of the current monitoring state
 */
export function getMonitorSummary(): MonitorSummary {
  const allAccounts = getAccounts();
  
  const summary: MonitorSummary = {
    totalTracked: allAccounts.length,
    byStatus: {
      [AccountStatus.ACTIVE]: 0,
      [AccountStatus.INACTIVE]: 0,
      [AccountStatus.CLOSED]: 0,
      [AccountStatus.RECLAIMED]: 0,
      [AccountStatus.WHITELISTED]: 0,
      [AccountStatus.ERROR]: 0,
    },
    totalRentLocked: 0,
    reclaimableRent: 0,
    lastCheckTime: undefined,
  };

  let latestCheck: Date | undefined;

  for (const account of allAccounts) {
    summary.byStatus[account.status]++;
    summary.totalRentLocked += account.rentLamports;
    
    if (account.status === AccountStatus.CLOSED) {
      summary.reclaimableRent += account.rentLamports;
    }

    if (!latestCheck || account.lastCheckedAt > latestCheck) {
      latestCheck = account.lastCheckedAt;
    }
  }

  summary.lastCheckTime = latestCheck;

  return summary;
}

export default {
  checkAllAccounts,
  checkSingleAccount,
  getAccountsReadyForReclaim,
  getMonitorSummary,
};
