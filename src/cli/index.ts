#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { table } from 'table';
import { loadConfig, validateConfig, printConfig, getConfig } from '../utils/config';
import { createLogger } from '../utils/logger';
import { initDatabase, getStats, getAccounts, addToWhitelist, removeFromWhitelist, getWhitelist, getReclaimTransactions } from '../core/database';
import { discoverSponsoredAccounts, addAccountManually } from '../core/discovery';
import { getKoraNodeInfo, getPayerSigner } from '../core/kora';
import { checkAllAccounts, getMonitorSummary } from '../core/monitor';
import { reclaimSingleAccount, reclaimAllEligible, checkEligibility, generateReclaimReport } from '../core/reclaim';
import { getConnection, getNetworkStatus, shortenPubkey, getExplorerUrl } from '../core/solana';
import { formatSol, AccountStatus } from '../types';

const program = new Command();

// Initialize (async)
async function init() {
  const config = loadConfig();
  const errors = validateConfig(config);
  
  if (errors.length > 0) {
    console.error(chalk.red('Configuration errors:'));
    errors.forEach(e => console.error(chalk.red(`  - ${e}`)));
    process.exit(1);
  }

  createLogger();
  await initDatabase();
}

program
  .name('kora-reclaim')
  .description('Automated rent-reclaim bot for Kora-sponsored Solana accounts')
  .version('1.0.0');

// Status command
program
  .command('status')
  .description('Show current bot status and statistics')
  .action(async () => {
    await init();
    const spinner = ora('Fetching status...').start();

    try {
      const config = getConfig();
      const stats = getStats();
      const summary = getMonitorSummary();
      const networkStatus = await getNetworkStatus();

      spinner.stop();

      console.log(chalk.bold.cyan('\n=== Kora Reclaim Bot Status ===\n'));
      
      console.log(chalk.bold('Network:'));
      console.log(`  Network: ${chalk.yellow(config.network)}`);
      console.log(`  RPC: ${config.rpcUrl}`);
      console.log(`  Current Slot: ${networkStatus.slot.toLocaleString()}`);
      console.log(`  Epoch: ${networkStatus.epochInfo.epoch}`);

      console.log(chalk.bold('\nAccounts:'));
      console.log(`  Total Tracked: ${chalk.white(stats.totalAccounts)}`);
      console.log(`  Active: ${chalk.green(stats.activeAccounts)}`);
      console.log(`  Inactive: ${chalk.yellow(stats.inactiveAccounts)}`);
      console.log(`  Closed: ${chalk.red(stats.closedAccounts)}`);
      console.log(`  Reclaimed: ${chalk.blue(stats.reclaimedAccounts)}`);
      console.log(`  Whitelisted: ${chalk.gray(stats.whitelistedAccounts)}`);

      console.log(chalk.bold('\nRent:'));
      console.log(`  Total Locked: ${chalk.yellow(formatSol(stats.totalRentLocked))}`);
      console.log(`  Reclaimable: ${chalk.green(formatSol(stats.reclaimableRent))}`);
      console.log(`  Total Reclaimed: ${chalk.blue(formatSol(stats.totalRentReclaimed))}`);

      console.log(chalk.bold('\nSettings:'));
      console.log(`  Dry Run: ${config.dryRun ? chalk.yellow('Yes') : chalk.green('No')}`);
      console.log(`  Auto Reclaim: ${config.autoReclaim ? chalk.green('Yes') : chalk.red('No')}`);
      console.log(`  Min Dormancy: ${config.minDormancyDays} days`);
      console.log(`  Min Reclaim: ${formatSol(config.minReclaimLamports)}`);

      if (summary.lastCheckTime) {
        console.log(`\nLast Check: ${summary.lastCheckTime.toLocaleString()}`);
      }

      console.log();

    } catch (error) {
      spinner.fail('Failed to fetch status');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Kora info command - fetch signer from Kora RPC
program
  .command('kora-info')
  .description('Fetch Kora node info (signer address, supported tokens)')
  .option('-u, --url <url>', 'Kora RPC URL')
  .action(async (options) => {
    const config = loadConfig();
    createLogger();
    
    const koraUrl = options.url || config.koraRpcUrl;
    
    if (!koraUrl) {
      console.log(chalk.red('\n❌ Kora RPC URL not provided.'));
      console.log(chalk.yellow('Use: npm run cli -- kora-info --url http://your-kora-node:8080'));
      console.log(chalk.yellow('Or set KORA_RPC_URL in .env'));
      return;
    }

    const spinner = ora(`Connecting to Kora node at ${koraUrl}...`).start();

    try {
      const info = await getKoraNodeInfo(koraUrl);

      if (!info) {
        spinner.fail('Failed to connect to Kora node');
        return;
      }

      spinner.stop();

      console.log(chalk.bold.cyan('\n=== Kora Node Info ===\n'));
      console.log(`Kora RPC URL: ${chalk.white(koraUrl)}`);
      console.log(`\nPayer Signer: ${chalk.green(info.payerSigner)}`);
      console.log(`Payment Destination: ${chalk.white(info.paymentDestination)}`);
      
      if (info.supportedTokens.length > 0) {
        console.log(`\nSupported Payment Tokens:`);
        info.supportedTokens.forEach(token => {
          console.log(`  - ${token}`);
        });
      }

      console.log(chalk.bold.yellow('\n📋 To monitor this Kora node, add to your .env:'));
      console.log(chalk.white(`KORA_SIGNER_PUBKEY=${info.payerSigner}`));
      console.log();

    } catch (error) {
      spinner.fail('Failed to fetch Kora node info');
      console.error(chalk.red(error));
    }
  });

// Discover command
program
  .command('discover')
  .description('Discover accounts sponsored by a Kora signer')
  .option('-s, --signer <pubkey>', 'Kora signer public key (fee payer address)')
  .option('-l, --limit <number>', 'Maximum transactions to analyze', '1000')
  .action(async (options) => {
    await init();
    const spinner = ora('Discovering sponsored accounts...').start();

    try {
      const result = await discoverSponsoredAccounts(
        options.signer,
        parseInt(options.limit)
      );

      spinner.stop();

      // If there are configuration errors (like missing signer), show them prominently
      if (result.totalFound === 0 && result.errors.length > 0) {
        console.log(chalk.bold.red('\n❌ Discovery Failed\n'));
        result.errors.forEach(err => {
          console.log(chalk.yellow(`  ${err}`));
        });
        console.log();
        return;
      }

      console.log(chalk.bold.cyan('\n=== Discovery Results ===\n'));
      console.log(`Total Found: ${chalk.white(result.totalFound)}`);
      console.log(`New Accounts: ${chalk.green(result.newAccounts)}`);
      console.log(`Existing: ${chalk.yellow(result.existingAccounts)}`);
      
      if (result.errors.length > 0) {
        console.log(chalk.red(`\nWarnings: ${result.errors.length}`));
        result.errors.slice(0, 5).forEach(err => console.log(chalk.yellow(`  - ${err}`)));
      }

      if (result.accounts.length > 0 && result.accounts.length <= 20) {
        console.log(chalk.bold('\nDiscovered Accounts:'));
        const tableData = [
          ['Pubkey', 'Type', 'Status', 'Rent'],
          ...result.accounts.map(a => [
            shortenPubkey(a.pubkey, 8),
            a.accountType,
            a.status,
            formatSol(a.rentLamports),
          ]),
        ];
        console.log(table(tableData));
      }

      console.log();

    } catch (error) {
      spinner.fail('Discovery failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Add account command
program
  .command('add <pubkey>')
  .description('Manually add an account to track')
  .option('-t, --tx <signature>', 'Sponsored transaction signature')
  .action(async (pubkey, options) => {
    await init();
    const spinner = ora('Adding account...').start();

    try {
      const account = await addAccountManually(pubkey, options.tx);

      if (account) {
        spinner.succeed('Account added');
        console.log(chalk.green(`\nAdded: ${account.pubkey}`));
        console.log(`  Type: ${account.accountType}`);
        console.log(`  Status: ${account.status}`);
        console.log(`  Rent: ${formatSol(account.rentLamports)}`);
      } else {
        spinner.fail('Failed to add account');
      }

    } catch (error) {
      spinner.fail('Failed to add account');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Check command
program
  .command('check')
  .description('Check all accounts for status changes')
  .action(async () => {
    await init();
    const spinner = ora('Checking accounts...').start();

    try {
      const result = await checkAllAccounts();

      spinner.stop();

      console.log(chalk.bold.cyan('\n=== Check Results ===\n'));
      console.log(`Checked: ${result.totalChecked} accounts`);
      console.log(`Status Changes: ${result.statusChanges.length}`);
      console.log(`Duration: ${result.duration}ms`);

      if (result.statusChanges.length > 0) {
        console.log(chalk.bold('\nStatus Changes:'));
        for (const change of result.statusChanges) {
          console.log(`  ${shortenPubkey(change.pubkey)}: ${change.previousStatus} → ${chalk.yellow(change.newStatus)}`);
          console.log(`    Reason: ${change.reason}`);
        }
      }

      if (result.errors.length > 0) {
        console.log(chalk.red(`\nErrors: ${result.errors.length}`));
      }

      console.log();

    } catch (error) {
      spinner.fail('Check failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Reclaim command
program
  .command('reclaim [pubkey]')
  .description('Reclaim rent from accounts')
  .option('-a, --all', 'Reclaim all eligible accounts')
  .option('-d, --dry-run', 'Simulate without executing transactions')
  .option('-f, --force', 'Skip dry-run mode (use real transactions)')
  .action(async (pubkey, options) => {
    await init();
    const config = getConfig();
    
    const dryRun = options.dryRun || (!options.force && config.dryRun);
    
    if (dryRun) {
      console.log(chalk.yellow('\n⚠️  DRY RUN MODE - No actual transactions will be executed\n'));
    }

    const spinner = ora('Processing reclaim...').start();

    try {
      if (options.all) {
        const result = await reclaimAllEligible(dryRun);

        spinner.stop();

        console.log(chalk.bold.cyan('\n=== Batch Reclaim Results ===\n'));
        console.log(`Eligible: ${result.totalEligible}`);
        console.log(`Attempted: ${result.totalAttempted}`);
        console.log(`Successful: ${chalk.green(result.totalSuccessful)}`);
        console.log(`Failed: ${chalk.red(result.totalFailed)}`);
        console.log(`Total Reclaimed: ${chalk.green(formatSol(result.totalLamportsReclaimed))}`);

      } else if (pubkey) {
        // Check eligibility first
        const eligibility = await checkEligibility(pubkey);
        
        if (!eligibility.eligible) {
          spinner.fail('Account not eligible');
          console.log(chalk.red('\nReasons:'));
          eligibility.reasons.forEach(r => console.log(`  - ${r}`));
          return;
        }

        const result = await reclaimSingleAccount(pubkey, dryRun);

        spinner.stop();

        if (result.success) {
          console.log(chalk.green('\n✓ Reclaim successful!'));
          console.log(`  Account: ${result.accountPubkey}`);
          console.log(`  Reclaimed: ${formatSol(result.lamportsReclaimed || 0)}`);
          if (result.txSignature && result.txSignature !== 'dry-run-signature') {
            console.log(`  Transaction: ${getExplorerUrl('tx', result.txSignature, config.network)}`);
          }
        } else {
          console.log(chalk.red('\n✗ Reclaim failed'));
          console.log(`  Error: ${result.error}`);
        }

      } else {
        spinner.stop();
        console.log(chalk.yellow('Please specify an account pubkey or use --all flag'));
        program.help();
      }

      console.log();

    } catch (error) {
      spinner.fail('Reclaim failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List tracked accounts')
  .option('-s, --status <status>', 'Filter by status (active, closed, reclaimed, etc.)')
  .option('-l, --limit <number>', 'Maximum accounts to show', '50')
  .action(async (options) => {
    await init();

    try {
      const filter: any = {};
      
      if (options.status) {
        filter.status = [options.status];
      }
      filter.limit = parseInt(options.limit);

      const accounts = getAccounts(filter);

      console.log(chalk.bold.cyan(`\n=== Tracked Accounts (${accounts.length}) ===\n`));

      if (accounts.length === 0) {
        console.log(chalk.yellow('No accounts found'));
        return;
      }

      const tableData = [
        ['Pubkey', 'Type', 'Status', 'Rent', 'Last Checked'],
        ...accounts.map(a => [
          shortenPubkey(a.pubkey, 6),
          a.accountType,
          getStatusColor(a.status),
          formatSol(a.rentLamports),
          a.lastCheckedAt.toLocaleDateString(),
        ]),
      ];

      console.log(table(tableData));

    } catch (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Whitelist commands
program
  .command('whitelist')
  .description('Manage account whitelist')
  .option('-a, --add <pubkey>', 'Add account to whitelist')
  .option('-r, --remove <pubkey>', 'Remove account from whitelist')
  .option('-l, --list', 'List all whitelisted accounts')
  .option('--reason <reason>', 'Reason for whitelisting')
  .action(async (options) => {
    await init();

    try {
      if (options.add) {
        addToWhitelist(options.add, options.reason);
        console.log(chalk.green(`\n✓ Added to whitelist: ${options.add}`));
      } else if (options.remove) {
        removeFromWhitelist(options.remove);
        console.log(chalk.yellow(`\n✓ Removed from whitelist: ${options.remove}`));
      } else if (options.list) {
        const whitelist = getWhitelist();
        
        console.log(chalk.bold.cyan(`\n=== Whitelist (${whitelist.length}) ===\n`));

        if (whitelist.length === 0) {
          console.log(chalk.yellow('No accounts whitelisted'));
          return;
        }

        const tableData = [
          ['Pubkey', 'Reason', 'Added'],
          ...whitelist.map(w => [
            shortenPubkey(w.pubkey, 8),
            w.reason || '-',
            w.addedAt.toLocaleDateString(),
          ]),
        ];

        console.log(table(tableData));
      } else {
        console.log(chalk.yellow('Please specify --add, --remove, or --list'));
      }

    } catch (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// History command
program
  .command('history')
  .description('Show reclaim transaction history')
  .option('-l, --limit <number>', 'Maximum transactions to show', '20')
  .action(async (options) => {
    await init();

    try {
      const config = getConfig();
      const transactions = getReclaimTransactions(undefined, parseInt(options.limit));

      console.log(chalk.bold.cyan(`\n=== Reclaim History (${transactions.length}) ===\n`));

      if (transactions.length === 0) {
        console.log(chalk.yellow('No reclaim transactions found'));
        return;
      }

      const tableData = [
        ['Account', 'Lamports', 'Success', 'Date', 'Signature'],
        ...transactions.map(tx => [
          shortenPubkey(tx.accountPubkey, 6),
          formatSol(tx.lamportsReclaimed),
          tx.success ? chalk.green('✓') : chalk.red('✗'),
          tx.reclaimedAt.toLocaleDateString(),
          tx.txSignature.startsWith('dry') ? chalk.yellow('dry-run') : shortenPubkey(tx.txSignature, 4),
        ]),
      ];

      console.log(table(tableData));

    } catch (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Report command
program
  .command('report')
  .description('Generate a reclaim report')
  .option('-o, --output <file>', 'Output file (JSON)')
  .action(async (options) => {
    await init();

    try {
      const report = generateReclaimReport();

      console.log(chalk.bold.cyan('\n=== Reclaim Report ===\n'));
      console.log(`Generated: ${report.generatedAt.toLocaleString()}`);
      console.log(`Network: ${report.network}`);
      console.log(`Treasury: ${shortenPubkey(report.treasuryPubkey, 8)}`);
      console.log(`\nEligible Accounts: ${report.summary.totalEligible}`);
      console.log(`Total Reclaimable: ${chalk.green(formatSol(report.summary.totalReclaimable))}`);

      if (report.eligibleAccounts.length > 0 && report.eligibleAccounts.length <= 20) {
        console.log(chalk.bold('\nEligible Accounts:'));
        const tableData = [
          ['Pubkey', 'Rent', 'Days Closed'],
          ...report.eligibleAccounts.map(a => [
            shortenPubkey(a.pubkey, 8),
            formatSol(a.rentLamports),
            a.daysClosed.toString(),
          ]),
        ];
        console.log(table(tableData));
      }

      if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
        console.log(chalk.green(`\nReport saved to: ${options.output}`));
      }

    } catch (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const config = loadConfig();
    printConfig(config);
  });

// Helper function to color status
function getStatusColor(status: AccountStatus): string {
  switch (status) {
    case AccountStatus.ACTIVE:
      return chalk.green(status);
    case AccountStatus.INACTIVE:
      return chalk.yellow(status);
    case AccountStatus.CLOSED:
      return chalk.red(status);
    case AccountStatus.RECLAIMED:
      return chalk.blue(status);
    case AccountStatus.WHITELISTED:
      return chalk.gray(status);
    default:
      return status;
  }
}

// Parse and execute
program.parse();
