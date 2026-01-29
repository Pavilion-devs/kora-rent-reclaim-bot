import { PublicKey } from '@solana/web3.js';

// Account status in the lifecycle
export enum AccountStatus {
  ACTIVE = 'active',           // Account exists and is being used
  INACTIVE = 'inactive',       // Account exists but no recent activity
  CLOSED = 'closed',           // Account has been closed
  RECLAIMED = 'reclaimed',     // Rent has been reclaimed
  WHITELISTED = 'whitelisted', // Account is protected from reclaim
  ERROR = 'error',             // Error occurred during processing
}

// Types of accounts that Kora might sponsor
export enum AccountType {
  TOKEN_ACCOUNT = 'token_account',
  ASSOCIATED_TOKEN = 'associated_token',
  PROGRAM_DATA = 'program_data',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

// Tracked account from the database
export interface TrackedAccount {
  id?: number;
  pubkey: string;
  createdAt: Date;
  sponsoredTxSignature: string;
  accountType: AccountType;
  rentLamports: number;
  status: AccountStatus;
  lastCheckedAt: Date;
  closedAt?: Date;
  programOwner?: string;
  dataSize?: number;
  notes?: string;
}

// Reclaim transaction record
export interface ReclaimTransaction {
  id?: number;
  accountPubkey: string;
  txSignature: string;
  lamportsReclaimed: number;
  reclaimedAt: Date;
  success: boolean;
  errorMessage?: string;
  treasuryPubkey: string;
}

// Result of an account discovery operation
export interface DiscoveryResult {
  totalFound: number;
  newAccounts: number;
  existingAccounts: number;
  accounts: TrackedAccount[];
  errors: string[];
}

// Result of a reclaim operation
export interface ReclaimResult {
  success: boolean;
  accountPubkey: string;
  txSignature?: string;
  lamportsReclaimed?: number;
  error?: string;
  dryRun: boolean;
}

// Batch reclaim summary
export interface BatchReclaimSummary {
  totalEligible: number;
  totalAttempted: number;
  totalSuccessful: number;
  totalFailed: number;
  totalLamportsReclaimed: number;
  results: ReclaimResult[];
  dryRun: boolean;
}

// Account eligibility check result
export interface EligibilityCheck {
  eligible: boolean;
  account: TrackedAccount;
  reasons: string[];
  warnings: string[];
}

// Configuration for the bot
export interface BotConfig {
  // Solana settings
  network: 'devnet' | 'mainnet-beta' | 'testnet';
  rpcUrl: string;
  wsUrl?: string;

  // Operator settings
  operatorKeypairPath: string;
  koraSignerPubkey?: string;
  koraRpcUrl?: string;
  treasuryPubkey?: string;

  // Monitoring settings
  monitorIntervalMinutes: number;
  minDormancyDays: number;
  minReclaimLamports: number;

  // Safety settings
  dryRun: boolean;
  autoReclaim: boolean;

  // Telegram settings
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramAlertsEnabled: boolean;

  // Dashboard settings
  dashboardPort: number;
  dashboardEnabled: boolean;

  // Database settings
  databasePath: string;

  // Logging settings
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFilePath?: string;
}

// Statistics for reporting
export interface AccountStats {
  totalAccounts: number;
  activeAccounts: number;
  inactiveAccounts: number;
  closedAccounts: number;
  reclaimedAccounts: number;
  whitelistedAccounts: number;
  totalRentLocked: number;       // in lamports
  totalRentReclaimed: number;    // in lamports
  reclaimableRent: number;       // in lamports (eligible for reclaim)
}

// Alert types for notifications
export enum AlertType {
  INFO = 'info',
  WARNING = 'warning',
  SUCCESS = 'success',
  ERROR = 'error',
}

// Alert message structure
export interface Alert {
  type: AlertType;
  title: string;
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

// Transaction history entry
export interface TransactionHistoryEntry {
  signature: string;
  timestamp: Date;
  type: 'sponsor' | 'close' | 'reclaim' | 'transfer';
  accountPubkey: string;
  lamports: number;
  success: boolean;
}

// Filter options for queries
export interface AccountFilter {
  status?: AccountStatus[];
  accountType?: AccountType[];
  minRentLamports?: number;
  maxRentLamports?: number;
  closedBefore?: Date;
  closedAfter?: Date;
  limit?: number;
  offset?: number;
}

// Solana account info extended
export interface SolanaAccountInfo {
  pubkey: PublicKey;
  lamports: number;
  owner: PublicKey;
  executable: boolean;
  rentEpoch: number;
  dataSize: number;
  exists: boolean;
}

// Helper to convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// Helper to convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * 1_000_000_000);
}

// Format lamports as SOL string
export function formatSol(lamports: number, decimals: number = 4): string {
  return `${lamportsToSol(lamports).toFixed(decimals)} SOL`;
}
