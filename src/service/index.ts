import * as cron from 'node-cron';
import { loadConfig, validateConfig, getConfig, ensureDirectories } from '../utils/config';
import { createLogger } from '../utils/logger';
import log from '../utils/logger';
import { initDatabase, closeDatabase, getStats } from '../core/database';
import { discoverSponsoredAccounts } from '../core/discovery';
import { checkAllAccounts, getMonitorSummary } from '../core/monitor';
import { reclaimAllEligible } from '../core/reclaim';
import { getNetworkStatus } from '../core/solana';
import { formatSol } from '../types';

/**
 * Background service that runs periodic monitoring and reclaim tasks
 */
export class KoraReclaimService {
  private monitorTask: cron.ScheduledTask | null = null;
  private discoveryTask: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastMonitorRun: Date | null = null;
  private lastDiscoveryRun: Date | null = null;

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    log.info('Initializing Kora Reclaim Service...');

    const config = loadConfig();
    const errors = validateConfig(config);

    if (errors.length > 0) {
      log.error('Configuration errors:', { errors });
      throw new Error(`Configuration errors: ${errors.join(', ')}`);
    }

    ensureDirectories(config);
    createLogger();
    await initDatabase();

    // Test connection
    try {
      const status = await getNetworkStatus();
      log.info('Connected to Solana network', {
        network: config.network,
        slot: status.slot,
        epoch: status.epochInfo.epoch,
      });
    } catch (error) {
      log.error('Failed to connect to Solana network', { error });
      throw error;
    }

    log.info('Service initialized successfully');
  }

  /**
   * Start the background service
   */
  start(): void {
    if (this.isRunning) {
      log.warn('Service is already running');
      return;
    }

    const config = getConfig();
    log.info('Starting Kora Reclaim Service...', {
      network: config.network,
      monitorInterval: `${config.monitorIntervalMinutes} minutes`,
      dryRun: config.dryRun,
      autoReclaim: config.autoReclaim,
    });

    // Schedule monitoring task (runs every N minutes)
    const monitorCron = `*/${config.monitorIntervalMinutes} * * * *`;
    this.monitorTask = cron.schedule(monitorCron, async () => {
      await this.runMonitorCycle();
    });

    // Schedule discovery task (runs daily at midnight)
    this.discoveryTask = cron.schedule('0 0 * * *', async () => {
      await this.runDiscoveryCycle();
    });

    this.isRunning = true;
    log.info('Service started');

    // Run initial cycles
    this.runMonitorCycle();
  }

  /**
   * Stop the background service
   */
  stop(): void {
    if (!this.isRunning) {
      log.warn('Service is not running');
      return;
    }

    log.info('Stopping Kora Reclaim Service...');

    if (this.monitorTask) {
      this.monitorTask.stop();
      this.monitorTask = null;
    }

    if (this.discoveryTask) {
      this.discoveryTask.stop();
      this.discoveryTask = null;
    }

    this.isRunning = false;
    log.info('Service stopped');
  }

  /**
   * Shutdown the service completely
   */
  async shutdown(): Promise<void> {
    this.stop();
    closeDatabase();
    log.info('Service shutdown complete');
  }

  /**
   * Run a monitoring cycle
   */
  async runMonitorCycle(): Promise<void> {
    log.monitor('Starting monitor cycle...');
    this.lastMonitorRun = new Date();

    try {
      const config = getConfig();

      // Check all accounts for status changes
      const checkResult = await checkAllAccounts();
      
      log.monitor('Monitor cycle complete', {
        checked: checkResult.totalChecked,
        changes: checkResult.statusChanges.length,
        duration: `${checkResult.duration}ms`,
      });

      // Log status changes
      for (const change of checkResult.statusChanges) {
        log.monitor(`Account status changed: ${change.pubkey}`, {
          from: change.previousStatus,
          to: change.newStatus,
          reason: change.reason,
        });
      }

      // Auto-reclaim if enabled
      if (config.autoReclaim && !config.dryRun) {
        const reclaimResult = await reclaimAllEligible(false);
        
        if (reclaimResult.totalSuccessful > 0) {
          log.reclaim('Auto-reclaim completed', {
            successful: reclaimResult.totalSuccessful,
            failed: reclaimResult.totalFailed,
            lamportsReclaimed: reclaimResult.totalLamportsReclaimed,
          });
        }
      }

      // Log current stats
      const stats = getStats();
      log.info('Current stats', {
        totalAccounts: stats.totalAccounts,
        active: stats.activeAccounts,
        closed: stats.closedAccounts,
        reclaimable: formatSol(stats.reclaimableRent),
        reclaimed: formatSol(stats.totalRentReclaimed),
      });

    } catch (error) {
      log.error('Monitor cycle failed', { error });
    }
  }

  /**
   * Run a discovery cycle
   */
  async runDiscoveryCycle(): Promise<void> {
    log.discovery('Starting discovery cycle...');
    this.lastDiscoveryRun = new Date();

    try {
      const result = await discoverSponsoredAccounts();
      
      log.discovery('Discovery cycle complete', {
        totalFound: result.totalFound,
        newAccounts: result.newAccounts,
        existing: result.existingAccounts,
        errors: result.errors.length,
      });

    } catch (error) {
      log.error('Discovery cycle failed', { error });
    }
  }

  /**
   * Get service status
   */
  getStatus(): ServiceStatus {
    const summary = getMonitorSummary();
    const stats = getStats();

    return {
      isRunning: this.isRunning,
      lastMonitorRun: this.lastMonitorRun,
      lastDiscoveryRun: this.lastDiscoveryRun,
      summary,
      stats,
    };
  }

  /**
   * Manually trigger a monitor cycle
   */
  async triggerMonitor(): Promise<void> {
    await this.runMonitorCycle();
  }

  /**
   * Manually trigger a discovery cycle
   */
  async triggerDiscovery(): Promise<void> {
    await this.runDiscoveryCycle();
  }
}

/**
 * Service status interface
 */
export interface ServiceStatus {
  isRunning: boolean;
  lastMonitorRun: Date | null;
  lastDiscoveryRun: Date | null;
  summary: ReturnType<typeof getMonitorSummary>;
  stats: ReturnType<typeof getStats>;
}

// Create singleton instance
let serviceInstance: KoraReclaimService | null = null;

export function getService(): KoraReclaimService {
  if (!serviceInstance) {
    serviceInstance = new KoraReclaimService();
  }
  return serviceInstance;
}

/**
 * Main entry point for running as a standalone service
 */
async function main() {
  const service = getService();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await service.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down...');
    await service.shutdown();
    process.exit(0);
  });

  try {
    await service.initialize();
    service.start();

    console.log('\n=== Kora Reclaim Service Running ===');
    console.log('Press Ctrl+C to stop\n');

  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default KoraReclaimService;
