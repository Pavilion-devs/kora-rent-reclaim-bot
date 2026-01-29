# Kora Rent-Reclaim Bot

> Automated rent recovery for Kora-sponsored Solana accounts

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-Devnet%20%7C%20Mainnet-blue)](https://solana.com)

## Overview

**Kora** is Solana's signing infrastructure that enables apps to sponsor transactions and account creation. When a Kora node sponsors account creation, SOL is locked as **rent** to keep those accounts alive on-chain.

Over time, many of these accounts become:
- Inactive (no recent activity)
- Closed (account deleted)
- No longer needed by users

In most cases, operators don't actively track or reclaim this rent, leading to **silent capital loss**.

This bot solves that operational gap by:
- 🔍 **Monitoring** accounts sponsored by your Kora node
- 🔔 **Detecting** when accounts are closed or eligible for cleanup
- 💰 **Reclaiming** locked rent SOL back to your operator treasury
- 📊 **Reporting** on where your rent went and what was recovered

## How Kora Works (And Where Rent Locking Happens)

Based on the [Kora Operators Documentation](https://launch.solana.com/docs/kora/operators), Kora is a **paymaster service** that sponsors Solana transaction fees for your users.

### The Sponsorship Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    User      │───▶│  Kora Node   │───▶│   Solana     │
│  (no SOL)    │    │ (Fee Payer)  │    │  Network     │
└──────────────┘    └──────────────┘    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  New Account │
                    │  Created     │
                    │  (Rent Paid) │
                    └──────────────┘
```

1. **User initiates transaction** - wants to create a token account, etc.
2. **Kora node sponsors** - your **signer keypair** (configured in `signers.toml`) signs as fee payer, covering:
   - Transaction fees (~0.000005 SOL)
   - **Rent deposit** (~0.00203 SOL for token accounts)
3. **Account created** - rent SOL is now locked in the account
4. **User interacts** - uses the account normally
5. **Account closed** - when user is done, the rent should return

### Key Kora Concepts

From the [JSON-RPC API](https://launch.solana.com/docs/kora/json-rpc-api):
- **`getPayerSigner`** - Returns your Kora node's fee payer address
- **`signAndSendTransaction`** - Signs and broadcasts gasless transactions
- **Signer Configuration** - Each operator configures their own keypair in `signers.toml`

### The Problem

When step 5 happens (or should happen), that rent often goes:
- ❌ Nowhere (account closed by user, rent goes to them)
- ❌ Unclaimed (account eligible but nobody closes it)
- ❌ Forgotten (operator has no visibility)

### Our Solution

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Kora Bot   │───▶│   Monitor    │───▶│   Reclaim    │
│              │    │   Accounts   │    │   Rent SOL   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                                       │
        ▼                                       ▼
┌──────────────┐                        ┌──────────────┐
│   Database   │                        │   Treasury   │
│   Tracking   │                        │   Wallet     │
└──────────────┘                        └──────────────┘
```

## Features

### Core Capabilities
- ✅ **Account Discovery** - Scan Kora node's transaction history to find sponsored accounts
- ✅ **Continuous Monitoring** - Track account status changes (active → closed → reclaimed)
- ✅ **Safe Reclaim** - Multiple safety checks before any reclaim operation
- ✅ **Whitelist/Blacklist** - Protect specific accounts from reclaim
- ✅ **Dry Run Mode** - Test operations without executing transactions

### Interfaces
- 🖥️ **CLI Tool** - Full-featured command-line interface
- 🤖 **Telegram Bot** - Real-time alerts and remote control
- ⏰ **Background Service** - Automated monitoring with cron scheduling
- 📊 **Dashboard** - Web interface for visualization (coming soon)

### Safety Features
- Minimum dormancy period before reclaim
- Minimum lamports threshold (avoid dust)
- Whitelist for protected accounts
- Blacklist for excluded programs
- Dry run mode for testing
- Comprehensive audit trail

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Solana CLI (optional, for keypair management)

### Setup

```bash
# Clone the repository
cd kora-reclaim-bot

# Install dependencies
npm install

# Copy environment template
cp env.example .env

# Edit configuration
nano .env
```

### Configuration

Edit `.env` with your settings:

```bash
# Solana Network
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Kora Configuration (choose one option)
# Option 1: If you know your signer address (from your signers.toml)
KORA_SIGNER_PUBKEY=YourKoraSignerPubkeyHere

# Option 2: If you have a running Kora node, fetch signer automatically
KORA_RPC_URL=http://your-kora-node:8080

# Operator keypair (for signing reclaim transactions)
OPERATOR_KEYPAIR_PATH=./keypair.json

# Where reclaimed SOL goes (defaults to operator wallet)
TREASURY_PUBKEY=

# Safety settings
DRY_RUN=true          # Start with dry run enabled!
AUTO_RECLAIM=false    # Manual reclaim initially
MIN_DORMANCY_DAYS=7   # Wait 7 days after closure
```

### Finding Your Kora Signer Address

**If you're running a Kora node**, your signer address is configured in `signers.toml`. You can also fetch it via the Kora RPC API:

```bash
# Using our CLI (if you have a running Kora node)
npm run cli -- kora-info --url http://your-kora-node:8080

# Or using curl
curl -X POST http://your-kora-node:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getPayerSigner","params":{}}'
```

### Generate a Test Keypair (Devnet)

```bash
# Using Solana CLI
solana-keygen new -o keypair.json

# Get some devnet SOL
solana airdrop 2 $(solana-keygen pubkey keypair.json) --url devnet
```

## Usage

### CLI Commands

```bash
# View all commands
npm run cli -- --help

# Show current status
npm run cli -- status

# Fetch Kora node info (signer address)
npm run cli -- kora-info --url http://your-kora-node:8080

# Discover sponsored accounts
npm run cli -- discover --signer <KORA_SIGNER_PUBKEY>

# List tracked accounts
npm run cli -- list
npm run cli -- list --status closed

# Check accounts for changes
npm run cli -- check

# View eligible accounts for reclaim
npm run cli -- report

# Reclaim a specific account (dry run)
npm run cli -- reclaim <ACCOUNT_PUBKEY> --dry-run

# Reclaim all eligible accounts (dry run)
npm run cli -- reclaim --all --dry-run

# Actually reclaim (disable dry run)
npm run cli -- reclaim --all --force

# Manage whitelist
npm run cli -- whitelist --list
npm run cli -- whitelist --add <PUBKEY> --reason "Active user account"
npm run cli -- whitelist --remove <PUBKEY>

# View reclaim history
npm run cli -- history

# Show configuration
npm run cli -- config
```

### Background Service

```bash
# Start the service
npm run service

# With PM2 (for production)
pm2 start npm --name kora-reclaim -- run service
```

The service will:
- Run account checks every N minutes (configurable)
- Run discovery daily at midnight
- Auto-reclaim if enabled
- Log all activities

### Telegram Bot

1. Create a bot with [@BotFather](https://t.me/botfather)
2. Get your chat ID (message [@userinfobot](https://t.me/userinfobot))
3. Configure in `.env`:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
TELEGRAM_ALERTS_ENABLED=true
```

4. Start the service - bot will be available!

**Telegram Commands:**
- `/status` - Current statistics
- `/accounts` - List tracked accounts
- `/check` - Run account check
- `/reclaim` - Reclaim eligible accounts
- `/report` - Generate report
- `/help` - All commands

## Understanding Solana Rent

### What is Rent?

Solana requires accounts to maintain a minimum balance to stay "rent-exempt". This prevents blockchain bloat from abandoned accounts.

| Account Type | Typical Size | Minimum Rent |
|-------------|--------------|--------------|
| Token Account | 165 bytes | ~0.00203 SOL |
| Empty Account | 0 bytes | ~0.00089 SOL |
| Large Data | 1KB | ~0.00739 SOL |

### When Can Rent Be Reclaimed?

1. **Account Closure** - When an account is closed via `CloseAccount` instruction, all remaining lamports (including rent) go to a designated recipient

2. **Empty Token Accounts** - Token accounts with 0 balance can be closed

3. **Program-Owned Accounts** - Must use the program's close instruction

### The Bot's Approach

```
1. Discover accounts where Kora was fee payer
2. Track their lifecycle (active → inactive → closed)
3. When closed + dormancy period passed:
   - Verify account is truly closable
   - Check whitelist/blacklist
   - Execute reclaim transaction
   - Record in audit log
```

## Architecture

```
src/
├── core/
│   ├── database.ts   # SQLite storage for tracking
│   ├── solana.ts     # Solana RPC interactions
│   ├── discovery.ts  # Find sponsored accounts
│   ├── monitor.ts    # Track account changes
│   └── reclaim.ts    # Execute reclaim operations
├── cli/
│   └── index.ts      # Command-line interface
├── service/
│   └── index.ts      # Background service
├── telegram/
│   └── bot.ts        # Telegram bot integration
├── utils/
│   ├── config.ts     # Configuration management
│   └── logger.ts     # Logging utilities
└── types/
    └── index.ts      # TypeScript definitions
```

## API Reference

### Programmatic Usage

```typescript
import { 
  discoverSponsoredAccounts,
  checkAllAccounts,
  reclaimAllEligible,
  getStats 
} from 'kora-reclaim-bot';

// Discover accounts
const discovery = await discoverSponsoredAccounts('KoraNodePubkey');
console.log(`Found ${discovery.totalFound} accounts`);

// Check for changes
const check = await checkAllAccounts();
console.log(`${check.statusChanges.length} accounts changed status`);

// Reclaim (with dry run)
const reclaim = await reclaimAllEligible(true);
console.log(`Would reclaim ${reclaim.totalLamportsReclaimed} lamports`);

// Get statistics
const stats = getStats();
console.log(`Total rent locked: ${stats.totalRentLocked} lamports`);
```

## Safety Considerations

### Before Running on Mainnet

1. **Test on Devnet First** - Always test with devnet SOL
2. **Enable Dry Run** - Start with `DRY_RUN=true`
3. **Set Reasonable Dormancy** - 7+ days recommended
4. **Whitelist Active Accounts** - Protect important accounts
5. **Review Logs** - Check what would be reclaimed
6. **Start Manual** - Set `AUTO_RECLAIM=false` initially

### What the Bot Will NOT Reclaim

- Accounts with recent activity
- Whitelisted accounts
- Accounts below minimum threshold
- Accounts not meeting dormancy period
- Accounts that fail safety checks

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## Troubleshooting

### "Keypair file not found"
- Ensure `OPERATOR_KEYPAIR_PATH` points to a valid JSON keypair file
- Generate one with `solana-keygen new -o keypair.json`

### "RPC rate limiting"
- Use a dedicated RPC provider (Helius, QuickNode, etc.)
- Increase `MONITOR_INTERVAL_MINUTES`

### "Account not eligible"
- Check the dormancy period hasn't passed
- Verify account is actually closed
- Check whitelist/blacklist

### "No accounts discovered"
- Verify `KORA_NODE_PUBKEY` is correct
- Ensure the node has sponsored transactions
- Try increasing the transaction scan limit

## Contributing

Contributions welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Resources

- [Kora Documentation](https://launch.solana.com/docs/kora/operators)
- [Solana Account Model](https://solana.com/docs/core/accounts)
- [Solana RPC API](https://solana.com/docs/rpc)
- [Kora GitHub](https://github.com/solana-foundation/kora)

---

**Built for the Superteam Bounty** 🚀
# kora-rent-reclaim-bot
