/**
 * Kora Rent-Reclaim Bot
 * 
 * Automated bot for monitoring and reclaiming rent from Solana accounts
 * sponsored by Kora nodes.
 * 
 * @author Kora Reclaim Bot Team
 * @license MIT
 */

// Export all modules
export * from './types';
export * from './utils/config';
export * from './utils/logger';
export * from './core';
export * from './service';

// Main exports for programmatic usage
export { getConfig, loadConfig, validateConfig } from './utils/config';
export { createLogger, getLogger, log } from './utils/logger';
export { 
  initDatabase, 
  getDatabase, 
  closeDatabase,
  getStats,
  getAccounts,
  getAccount,
  upsertAccount,
} from './core/database';
export { 
  getConnection, 
  loadOperatorKeypair,
  getAccountInfo,
  shortenPubkey,
  getExplorerUrl,
} from './core/solana';
export { discoverSponsoredAccounts, addAccountManually } from './core/discovery';
export { checkAllAccounts, getMonitorSummary } from './core/monitor';
export { 
  reclaimSingleAccount, 
  reclaimAllEligible, 
  checkEligibility,
  generateReclaimReport,
} from './core/reclaim';
export { KoraReclaimService, getService } from './service';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🔧 Kora Rent-Reclaim Bot                                    ║
║                                                               ║
║   Automated rent recovery for Kora-sponsored Solana accounts  ║
║                                                               ║
║   Commands:                                                   ║
║   • npm run cli -- --help    View CLI commands                ║
║   • npm run service          Start background service         ║
║   • npm run dashboard        Start web dashboard              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
