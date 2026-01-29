// Dashboard Types for Kora Rent Reclaim Bot - Matches Bot Database Schema

export type AccountStatus = 'active' | 'inactive' | 'closed' | 'reclaimed' | 'whitelisted';

export type AccountType = 'token_account' | 'pda' | 'system' | 'unknown';

export interface TrackedAccount {
  id: number;
  pubkey: string;
  createdAt: string;
  sponsoredTxSignature: string | null;
  accountType: AccountType;
  rentLamports: number;
  status: AccountStatus;
  lastCheckedAt: string;
  closedAt: string | null;
  programOwner: string | null;
  dataSize: number | null;
  notes: string | null;
  isWhitelisted: boolean;
  isBlacklisted: boolean;
}

export interface ReclaimTransaction {
  id: number;
  accountPubkey: string;
  txSignature: string;
  lamportsReclaimed: number;
  reclaimedAt: string;
  success: boolean;
  errorMessage: string | null;
  treasuryPubkey: string;
}

export interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  inactiveAccounts: number;
  closedAccounts: number;
  reclaimedAccounts: number;
  whitelistedAccounts: number;
  totalRentLocked: number;
  totalRentReclaimed: number;
  reclaimableRent: number;
}

export interface WhitelistEntry {
  pubkey: string;
  reason: string | null;
  addedAt: string;
}

export interface BlacklistEntry {
  pubkey: string;
  reason: string | null;
  addedAt: string;
}
