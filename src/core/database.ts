import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { 
  TrackedAccount, 
  ReclaimTransaction, 
  AccountStatus, 
  AccountType,
  AccountStats,
  AccountFilter 
} from '../types';
import { getConfig } from '../utils/config';
import log from '../utils/logger';

let db: SqlJsDatabase | null = null;
let dbPath: string = '';

/**
 * Initialize the database with required tables
 */
export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db) {
    return db;
  }

  const config = getConfig();
  dbPath = config.databasePath;
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Initialize SQL.js
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    log.database('Database loaded from file', { path: dbPath });
  } else {
    db = new SQL.Database();
    log.database('New database created', { path: dbPath });
  }

  // Create tables
  db.run(`
    -- Tracked accounts table
    CREATE TABLE IF NOT EXISTS tracked_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pubkey TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      sponsored_tx_signature TEXT,
      account_type TEXT NOT NULL DEFAULT 'unknown',
      rent_lamports INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      last_checked_at TEXT NOT NULL,
      closed_at TEXT,
      program_owner TEXT,
      data_size INTEGER,
      notes TEXT
    );
  `);

  db.run(`
    -- Reclaim transactions table
    CREATE TABLE IF NOT EXISTS reclaim_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_pubkey TEXT NOT NULL,
      tx_signature TEXT NOT NULL,
      lamports_reclaimed INTEGER NOT NULL,
      reclaimed_at TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      treasury_pubkey TEXT NOT NULL
    );
  `);

  db.run(`
    -- Whitelist table
    CREATE TABLE IF NOT EXISTS whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pubkey TEXT UNIQUE NOT NULL,
      reason TEXT,
      added_at TEXT NOT NULL
    );
  `);

  db.run(`
    -- Blacklist table (programs/accounts to never reclaim)
    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pubkey TEXT UNIQUE NOT NULL,
      reason TEXT,
      added_at TEXT NOT NULL
    );
  `);

  // Create indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_accounts_status ON tracked_accounts(status);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_accounts_pubkey ON tracked_accounts(pubkey);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reclaim_account ON reclaim_transactions(account_pubkey);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_reclaim_signature ON reclaim_transactions(tx_signature);`);

  // Save to file
  saveDatabase();

  log.database('Database initialized');
  return db;
}

/**
 * Save database to file
 */
function saveDatabase(): void {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

/**
 * Get the database instance
 */
export function getDatabase(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
    log.database('Database connection closed');
  }
}

// ============ Account Operations ============

/**
 * Add or update a tracked account
 */
export function upsertAccount(account: Omit<TrackedAccount, 'id'>): TrackedAccount {
  const database = getDatabase();
  
  // Check if account exists
  const existing = database.exec(
    `SELECT id FROM tracked_accounts WHERE pubkey = '${account.pubkey}'`
  );

  if (existing.length > 0 && existing[0].values.length > 0) {
    // Update
    database.run(`
      UPDATE tracked_accounts SET
        rent_lamports = ?,
        status = ?,
        last_checked_at = ?,
        closed_at = COALESCE(?, closed_at),
        program_owner = COALESCE(?, program_owner),
        data_size = COALESCE(?, data_size),
        notes = COALESCE(?, notes)
      WHERE pubkey = ?
    `, [
      account.rentLamports,
      account.status,
      account.lastCheckedAt.toISOString(),
      account.closedAt?.toISOString() || null,
      account.programOwner || null,
      account.dataSize || null,
      account.notes || null,
      account.pubkey,
    ]);
  } else {
    // Insert
    database.run(`
      INSERT INTO tracked_accounts (
        pubkey, created_at, sponsored_tx_signature, account_type,
        rent_lamports, status, last_checked_at, closed_at, program_owner, data_size, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      account.pubkey,
      account.createdAt.toISOString(),
      account.sponsoredTxSignature || null,
      account.accountType,
      account.rentLamports,
      account.status,
      account.lastCheckedAt.toISOString(),
      account.closedAt?.toISOString() || null,
      account.programOwner || null,
      account.dataSize || null,
      account.notes || null,
    ]);
  }

  saveDatabase();
  log.database('Upserted account', { pubkey: account.pubkey, status: account.status });
  
  return getAccount(account.pubkey)!;
}

/**
 * Get account by public key
 */
export function getAccount(pubkey: string): TrackedAccount | null {
  const database = getDatabase();
  const result = database.exec(`SELECT * FROM tracked_accounts WHERE pubkey = '${pubkey}'`);
  
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return rowToAccount(result[0].columns, result[0].values[0]);
}

/**
 * Get all accounts with optional filtering
 */
export function getAccounts(filter?: AccountFilter): TrackedAccount[] {
  const database = getDatabase();
  
  let query = 'SELECT * FROM tracked_accounts WHERE 1=1';
  const params: (string | number)[] = [];

  if (filter?.status && filter.status.length > 0) {
    const placeholders = filter.status.map(() => '?').join(', ');
    query += ` AND status IN (${placeholders})`;
    params.push(...filter.status);
  }

  if (filter?.accountType && filter.accountType.length > 0) {
    const placeholders = filter.accountType.map(() => '?').join(', ');
    query += ` AND account_type IN (${placeholders})`;
    params.push(...filter.accountType);
  }

  if (filter?.minRentLamports !== undefined) {
    query += ' AND rent_lamports >= ?';
    params.push(filter.minRentLamports);
  }

  if (filter?.maxRentLamports !== undefined) {
    query += ' AND rent_lamports <= ?';
    params.push(filter.maxRentLamports);
  }

  if (filter?.closedBefore) {
    query += ' AND closed_at <= ?';
    params.push(filter.closedBefore.toISOString());
  }

  if (filter?.closedAfter) {
    query += ' AND closed_at >= ?';
    params.push(filter.closedAfter.toISOString());
  }

  query += ' ORDER BY created_at DESC';

  if (filter?.limit) {
    query += ` LIMIT ${filter.limit}`;
  }

  if (filter?.offset) {
    query += ` OFFSET ${filter.offset}`;
  }

  const stmt = database.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const accounts: TrackedAccount[] = [];
  while (stmt.step()) {
    const row = stmt.get();
    accounts.push(rowToAccount(stmt.getColumnNames(), row));
  }
  stmt.free();

  return accounts;
}

/**
 * Get eligible accounts for reclaim
 */
export function getEligibleAccounts(minDormancyDays: number, minLamports: number): TrackedAccount[] {
  const database = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - minDormancyDays);

  const query = `
    SELECT ta.* FROM tracked_accounts ta
    LEFT JOIN whitelist w ON ta.pubkey = w.pubkey
    LEFT JOIN blacklist b ON ta.pubkey = b.pubkey
    WHERE ta.status = 'closed'
    AND ta.closed_at <= ?
    AND ta.rent_lamports >= ?
    AND w.pubkey IS NULL
    AND b.pubkey IS NULL
  `;

  const stmt = database.prepare(query);
  stmt.bind([cutoffDate.toISOString(), minLamports]);

  const accounts: TrackedAccount[] = [];
  while (stmt.step()) {
    const row = stmt.get();
    accounts.push(rowToAccount(stmt.getColumnNames(), row));
  }
  stmt.free();

  return accounts;
}

/**
 * Update account status
 */
export function updateAccountStatus(pubkey: string, status: AccountStatus, closedAt?: Date): void {
  const database = getDatabase();
  database.run(`
    UPDATE tracked_accounts 
    SET status = ?, 
        closed_at = COALESCE(?, closed_at),
        last_checked_at = ?
    WHERE pubkey = ?
  `, [status, closedAt?.toISOString() || null, new Date().toISOString(), pubkey]);

  saveDatabase();
  log.database('Updated account status', { pubkey, status });
}

/**
 * Update account rent balance
 */
export function updateAccountRent(pubkey: string, rentLamports: number): void {
  const database = getDatabase();
  database.run(`
    UPDATE tracked_accounts 
    SET rent_lamports = ?,
        last_checked_at = ?
    WHERE pubkey = ?
  `, [rentLamports, new Date().toISOString(), pubkey]);

  saveDatabase();
}

// ============ Reclaim Transaction Operations ============

/**
 * Record a reclaim transaction
 */
export function recordReclaimTransaction(tx: Omit<ReclaimTransaction, 'id'>): ReclaimTransaction {
  const database = getDatabase();
  
  database.run(`
    INSERT INTO reclaim_transactions (
      account_pubkey, tx_signature, lamports_reclaimed,
      reclaimed_at, success, error_message, treasury_pubkey
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    tx.accountPubkey,
    tx.txSignature,
    tx.lamportsReclaimed,
    tx.reclaimedAt.toISOString(),
    tx.success ? 1 : 0,
    tx.errorMessage || null,
    tx.treasuryPubkey,
  ]);

  saveDatabase();
  log.database('Recorded reclaim transaction', { 
    signature: tx.txSignature, 
    success: tx.success 
  });

  // Get the inserted record
  const result = database.exec(`
    SELECT * FROM reclaim_transactions WHERE tx_signature = '${tx.txSignature}'
  `);

  if (result.length > 0 && result[0].values.length > 0) {
    return rowToReclaimTransaction(result[0].columns, result[0].values[0]);
  }

  return { id: 0, ...tx };
}

/**
 * Get reclaim transactions for an account
 */
export function getReclaimTransactions(accountPubkey?: string, limit?: number): ReclaimTransaction[] {
  const database = getDatabase();
  
  let query = 'SELECT * FROM reclaim_transactions';
  const params: string[] = [];

  if (accountPubkey) {
    query += ' WHERE account_pubkey = ?';
    params.push(accountPubkey);
  }

  query += ' ORDER BY reclaimed_at DESC';

  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  const stmt = database.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }

  const transactions: ReclaimTransaction[] = [];
  while (stmt.step()) {
    const row = stmt.get();
    transactions.push(rowToReclaimTransaction(stmt.getColumnNames(), row));
  }
  stmt.free();

  return transactions;
}

// ============ Whitelist/Blacklist Operations ============

/**
 * Add account to whitelist
 */
export function addToWhitelist(pubkey: string, reason?: string): void {
  const database = getDatabase();
  database.run(`
    INSERT OR REPLACE INTO whitelist (pubkey, reason, added_at)
    VALUES (?, ?, ?)
  `, [pubkey, reason || null, new Date().toISOString()]);

  // Update account status
  updateAccountStatus(pubkey, AccountStatus.WHITELISTED);
  saveDatabase();
  log.database('Added to whitelist', { pubkey });
}

/**
 * Remove from whitelist
 */
export function removeFromWhitelist(pubkey: string): void {
  const database = getDatabase();
  database.run('DELETE FROM whitelist WHERE pubkey = ?', [pubkey]);
  saveDatabase();
  log.database('Removed from whitelist', { pubkey });
}

/**
 * Check if account is whitelisted
 */
export function isWhitelisted(pubkey: string): boolean {
  const database = getDatabase();
  const result = database.exec(`SELECT 1 FROM whitelist WHERE pubkey = '${pubkey}'`);
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * Get all whitelisted accounts
 */
export function getWhitelist(): { pubkey: string; reason?: string; addedAt: Date }[] {
  const database = getDatabase();
  const result = database.exec('SELECT * FROM whitelist ORDER BY added_at DESC');
  
  if (result.length === 0) {
    return [];
  }

  const columns = result[0].columns;
  return result[0].values.map((row: (string | number | null)[]) => {
    const obj: Record<string, string | number | null> = {};
    columns.forEach((col: string, i: number) => obj[col] = row[i]);
    return {
      pubkey: obj.pubkey as string,
      reason: obj.reason as string | undefined,
      addedAt: new Date(obj.added_at as string),
    };
  });
}

/**
 * Add to blacklist
 */
export function addToBlacklist(pubkey: string, reason?: string): void {
  const database = getDatabase();
  database.run(`
    INSERT OR REPLACE INTO blacklist (pubkey, reason, added_at)
    VALUES (?, ?, ?)
  `, [pubkey, reason || null, new Date().toISOString()]);

  saveDatabase();
  log.database('Added to blacklist', { pubkey });
}

/**
 * Check if account is blacklisted
 */
export function isBlacklisted(pubkey: string): boolean {
  const database = getDatabase();
  const result = database.exec(`SELECT 1 FROM blacklist WHERE pubkey = '${pubkey}'`);
  return result.length > 0 && result[0].values.length > 0;
}

// ============ Statistics ============

/**
 * Get account statistics
 */
export function getStats(): AccountStats {
  const database = getDatabase();

  const stats: AccountStats = {
    totalAccounts: 0,
    activeAccounts: 0,
    inactiveAccounts: 0,
    closedAccounts: 0,
    reclaimedAccounts: 0,
    whitelistedAccounts: 0,
    totalRentLocked: 0,
    totalRentReclaimed: 0,
    reclaimableRent: 0,
  };

  // Count by status
  const statusResult = database.exec(`
    SELECT status, COUNT(*) as count, SUM(rent_lamports) as total_rent
    FROM tracked_accounts
    GROUP BY status
  `);

  if (statusResult.length > 0) {
    const columns = statusResult[0].columns;
    for (const row of statusResult[0].values) {
      const obj: Record<string, string | number | null> = {};
      columns.forEach((col: string, i: number) => obj[col] = row[i]);
      
      const count = obj.count as number;
      const totalRent = (obj.total_rent as number) || 0;
      
      stats.totalAccounts += count;
      stats.totalRentLocked += totalRent;

      switch (obj.status) {
        case AccountStatus.ACTIVE:
          stats.activeAccounts = count;
          break;
        case AccountStatus.INACTIVE:
          stats.inactiveAccounts = count;
          break;
        case AccountStatus.CLOSED:
          stats.closedAccounts = count;
          stats.reclaimableRent += totalRent;
          break;
        case AccountStatus.RECLAIMED:
          stats.reclaimedAccounts = count;
          break;
        case AccountStatus.WHITELISTED:
          stats.whitelistedAccounts = count;
          break;
      }
    }
  }

  // Total reclaimed
  const reclaimResult = database.exec(`
    SELECT SUM(lamports_reclaimed) as total FROM reclaim_transactions WHERE success = 1
  `);

  if (reclaimResult.length > 0 && reclaimResult[0].values.length > 0) {
    stats.totalRentReclaimed = (reclaimResult[0].values[0][0] as number) || 0;
  }

  return stats;
}

// ============ Helper Functions ============

function rowToAccount(columns: string[], row: (string | number | null)[]): TrackedAccount {
  const obj: Record<string, string | number | null> = {};
  columns.forEach((col: string, i: number) => obj[col] = row[i]);

  return {
    id: obj.id as number,
    pubkey: obj.pubkey as string,
    createdAt: new Date(obj.created_at as string),
    sponsoredTxSignature: obj.sponsored_tx_signature as string,
    accountType: obj.account_type as AccountType,
    rentLamports: obj.rent_lamports as number,
    status: obj.status as AccountStatus,
    lastCheckedAt: new Date(obj.last_checked_at as string),
    closedAt: obj.closed_at ? new Date(obj.closed_at as string) : undefined,
    programOwner: obj.program_owner as string | undefined,
    dataSize: obj.data_size as number | undefined,
    notes: obj.notes as string | undefined,
  };
}

function rowToReclaimTransaction(columns: string[], row: (string | number | null)[]): ReclaimTransaction {
  const obj: Record<string, string | number | null> = {};
  columns.forEach((col: string, i: number) => obj[col] = row[i]);

  return {
    id: obj.id as number,
    accountPubkey: obj.account_pubkey as string,
    txSignature: obj.tx_signature as string,
    lamportsReclaimed: obj.lamports_reclaimed as number,
    reclaimedAt: new Date(obj.reclaimed_at as string),
    success: !!(obj.success as number),
    errorMessage: obj.error_message as string | undefined,
    treasuryPubkey: obj.treasury_pubkey as string,
  };
}

export default {
  initDatabase,
  getDatabase,
  closeDatabase,
  upsertAccount,
  getAccount,
  getAccounts,
  getEligibleAccounts,
  updateAccountStatus,
  updateAccountRent,
  recordReclaimTransaction,
  getReclaimTransactions,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  getWhitelist,
  addToBlacklist,
  isBlacklisted,
  getStats,
};
