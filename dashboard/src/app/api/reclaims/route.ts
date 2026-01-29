import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

interface ReclaimRow {
  id: number;
  account_pubkey: string;
  tx_signature: string;
  lamports_reclaimed: number;
  reclaimed_at: string;
  success: number;
  error_message: string | null;
  treasury_pubkey: string;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const accountPubkey = searchParams.get('account');
    
    const db = getDatabase();
    
    if (!db) {
      return NextResponse.json([]);
    }

    let query = 'SELECT * FROM reclaim_transactions WHERE 1=1';
    const params: string[] = [];
    
    if (accountPubkey) {
      query += ' AND account_pubkey = ?';
      params.push(accountPubkey);
    }
    
    query += ' ORDER BY reclaimed_at DESC';
    
    if (limit) {
      query += ` LIMIT ${parseInt(limit)}`;
    }

    const rows = db.prepare(query).all(...params) as ReclaimRow[];
    
    const transactions = rows.map((row) => ({
      id: row.id,
      accountPubkey: row.account_pubkey,
      txSignature: row.tx_signature,
      lamportsReclaimed: row.lamports_reclaimed,
      reclaimedAt: row.reclaimed_at,
      success: !!row.success,
      errorMessage: row.error_message,
      treasuryPubkey: row.treasury_pubkey,
    }));

    return NextResponse.json(transactions);
  } catch (error) {
    console.error('Error fetching reclaims:', error);
    return NextResponse.json({ error: 'Failed to fetch reclaims' }, { status: 500 });
  }
}
