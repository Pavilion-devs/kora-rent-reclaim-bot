import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Path to the bot's database
const DB_PATH = path.join(process.cwd(), '..', 'data', 'kora-reclaim.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database | null {
  // Check if database file exists
  if (!fs.existsSync(DB_PATH)) {
    console.log(`Database not found at: ${DB_PATH}`);
    return null;
  }

  // Reuse existing connection
  if (db) {
    return db;
  }

  try {
    db = new Database(DB_PATH, { readonly: true });
    return db;
  } catch (error) {
    console.error('Error opening database:', error);
    return null;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
