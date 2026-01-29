import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

export async function GET() {
  try {
    const db = getDatabase();
    
    if (!db) {
      return NextResponse.json({
        totalAccounts: 0,
        activeAccounts: 0,
        inactiveAccounts: 0,
        closedAccounts: 0,
        reclaimedAccounts: 0,
        whitelistedAccounts: 0,
        totalRentLocked: 0,
        totalRentReclaimed: 0,
        reclaimableRent: 0,
      });
    }

    const stats = {
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
    const statusRows = db.prepare(`
      SELECT status, COUNT(*) as count, SUM(rent_lamports) as total_rent
      FROM tracked_accounts
      GROUP BY status
    `).all() as { status: string; count: number; total_rent: number | null }[];

    for (const row of statusRows) {
      const count = row.count;
      const totalRent = row.total_rent || 0;
      
      stats.totalAccounts += count;
      stats.totalRentLocked += totalRent;

      switch (row.status) {
        case 'active':
          stats.activeAccounts = count;
          break;
        case 'inactive':
          stats.inactiveAccounts = count;
          break;
        case 'closed':
          stats.closedAccounts = count;
          stats.reclaimableRent += totalRent;
          break;
        case 'reclaimed':
          stats.reclaimedAccounts = count;
          break;
        case 'whitelisted':
          stats.whitelistedAccounts = count;
          break;
      }
    }

    // Total reclaimed
    const reclaimRow = db.prepare(`
      SELECT SUM(lamports_reclaimed) as total FROM reclaim_transactions WHERE success = 1
    `).get() as { total: number | null } | undefined;

    if (reclaimRow?.total) {
      stats.totalRentReclaimed = reclaimRow.total;
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
