import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { BotConfig } from '../types';

// Load environment variables
dotenv.config();

/**
 * Validates and loads the bot configuration from environment variables
 */
export function loadConfig(): BotConfig {
  const config: BotConfig = {
    // Solana settings
    network: (process.env.SOLANA_NETWORK as BotConfig['network']) || 'devnet',
    rpcUrl: process.env.SOLANA_RPC_URL || getDefaultRpcUrl(process.env.SOLANA_NETWORK || 'devnet'),
    wsUrl: process.env.SOLANA_WS_URL,

  // Operator settings
  operatorKeypairPath: process.env.OPERATOR_KEYPAIR_PATH || './keypair.json',
  koraSignerPubkey: process.env.KORA_SIGNER_PUBKEY || undefined,
  koraRpcUrl: process.env.KORA_RPC_URL || undefined,
  treasuryPubkey: process.env.TREASURY_PUBKEY || undefined,

    // Monitoring settings
    monitorIntervalMinutes: parseInt(process.env.MONITOR_INTERVAL_MINUTES || '5', 10),
    minDormancyDays: parseInt(process.env.MIN_DORMANCY_DAYS || '7', 10),
    minReclaimLamports: parseInt(process.env.MIN_RECLAIM_LAMPORTS || '100000', 10),

    // Safety settings
    dryRun: process.env.DRY_RUN !== 'false',
    autoReclaim: process.env.AUTO_RECLAIM === 'true',

    // Telegram settings
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
    telegramChatId: process.env.TELEGRAM_CHAT_ID || undefined,
    telegramAlertsEnabled: process.env.TELEGRAM_ALERTS_ENABLED === 'true',

    // Dashboard settings
    dashboardPort: parseInt(process.env.DASHBOARD_PORT || '3000', 10),
    dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true',

    // Database settings
    databasePath: process.env.DATABASE_PATH || './data/kora-reclaim.db',

    // Logging settings
    logLevel: (process.env.LOG_LEVEL as BotConfig['logLevel']) || 'info',
    logFilePath: process.env.LOG_FILE_PATH || './logs/kora-reclaim.log',
  };

  return config;
}

/**
 * Gets the default RPC URL for a given network
 */
function getDefaultRpcUrl(network: string): string {
  switch (network) {
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    case 'devnet':
    default:
      return 'https://api.devnet.solana.com';
  }
}

/**
 * Validates the configuration and returns any errors
 */
export function validateConfig(config: BotConfig): string[] {
  const errors: string[] = [];

  // Validate network
  if (!['devnet', 'mainnet-beta', 'testnet'].includes(config.network)) {
    errors.push(`Invalid network: ${config.network}. Must be 'devnet', 'mainnet-beta', or 'testnet'.`);
  }

  // Validate RPC URL
  if (!config.rpcUrl) {
    errors.push('RPC URL is required.');
  }

  // Validate keypair path if not in dry-run mode
  if (!config.dryRun) {
    if (!config.operatorKeypairPath) {
      errors.push('Operator keypair path is required for non-dry-run mode.');
    } else if (!fs.existsSync(config.operatorKeypairPath)) {
      errors.push(`Operator keypair file not found: ${config.operatorKeypairPath}`);
    }
  }

  // Validate monitoring settings
  if (config.monitorIntervalMinutes < 1) {
    errors.push('Monitor interval must be at least 1 minute.');
  }

  if (config.minDormancyDays < 0) {
    errors.push('Minimum dormancy days cannot be negative.');
  }

  if (config.minReclaimLamports < 0) {
    errors.push('Minimum reclaim lamports cannot be negative.');
  }

  // Validate Telegram settings if enabled
  if (config.telegramAlertsEnabled) {
    if (!config.telegramBotToken) {
      errors.push('Telegram bot token is required when alerts are enabled.');
    }
    if (!config.telegramChatId) {
      errors.push('Telegram chat ID is required when alerts are enabled.');
    }
  }

  // Validate dashboard port
  if (config.dashboardPort < 1 || config.dashboardPort > 65535) {
    errors.push('Dashboard port must be between 1 and 65535.');
  }

  return errors;
}

/**
 * Ensures required directories exist
 */
export function ensureDirectories(config: BotConfig): void {
  // Ensure database directory exists
  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Ensure log directory exists
  if (config.logFilePath) {
    const logDir = path.dirname(config.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
}

/**
 * Prints the current configuration (with sensitive data masked)
 */
export function printConfig(config: BotConfig): void {
  console.log('\n=== Bot Configuration ===');
  console.log(`Network: ${config.network}`);
  console.log(`RPC URL: ${config.rpcUrl}`);
  console.log(`Kora Signer: ${config.koraSignerPubkey || 'Not set'}`);
  console.log(`Kora RPC: ${config.koraRpcUrl || 'Not set'}`);
  console.log(`Treasury: ${config.treasuryPubkey || 'Operator wallet'}`);
  console.log(`\nMonitoring:`);
  console.log(`  Interval: ${config.monitorIntervalMinutes} minutes`);
  console.log(`  Min Dormancy: ${config.minDormancyDays} days`);
  console.log(`  Min Reclaim: ${config.minReclaimLamports} lamports`);
  console.log(`\nSafety:`);
  console.log(`  Dry Run: ${config.dryRun}`);
  console.log(`  Auto Reclaim: ${config.autoReclaim}`);
  console.log(`\nTelegram Alerts: ${config.telegramAlertsEnabled}`);
  console.log(`Dashboard: ${config.dashboardEnabled ? `http://localhost:${config.dashboardPort}` : 'Disabled'}`);
  console.log('========================\n');
}

// Export singleton config instance
let _config: BotConfig | null = null;

export function getConfig(): BotConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
