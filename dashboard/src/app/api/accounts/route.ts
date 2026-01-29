import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

interface AccountRow {
  id: number;
  pubkey: string;
  created_at: string;
  sponsored_tx_signature: string | null;
  account_type: string;
  rent_lamports: number;
  status: string;
  last_checked_at: string;
  closed_at: string | null;
  program_owner: string | null;
  data_size: number | null;
  notes: string | null;
}

interface ListEntry {
  pubkey: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = searchParams.get('limit');
    
    const db = getDatabase();
    
    if (!db) {
      return NextResponse.json([]);
    }

    let query = 'SELECT * FROM tracked_accounts WHERE 1=1';
    const params: string[] = [];
    
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    if (limit) {
      query += ` LIMIT ${parseInt(limit)}`;
    }

    const rows = db.prepare(query).all(...params) as AccountRow[];
    
    const accounts = rows.map((row) => ({
      id: row.id,
      pubkey: row.pubkey,
      createdAt: row.created_at,
      sponsoredTxSignature: row.sponsored_tx_signature,
      accountType: row.account_type,
      rentLamports: row.rent_lamports,
      status: row.status,
      lastCheckedAt: row.last_checked_at,
      closedAt: row.closed_at,
      programOwner: row.program_owner,
      dataSize: row.data_size,
      notes: row.notes,
    }));

    // Get whitelist and blacklist status for each account
    const whitelistRows = db.prepare('SELECT pubkey FROM whitelist').all() as ListEntry[];
    const blacklistRows = db.prepare('SELECT pubkey FROM blacklist').all() as ListEntry[];
    
    const whitelisted = new Set(whitelistRows.map((r) => r.pubkey));
    const blacklisted = new Set(blacklistRows.map((r) => r.pubkey));

    const enrichedAccounts = accounts.map((acc) => ({
      ...acc,
      isWhitelisted: whitelisted.has(acc.pubkey),
      isBlacklisted: blacklisted.has(acc.pubkey),
    }));

    return NextResponse.json(enrichedAccounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}
