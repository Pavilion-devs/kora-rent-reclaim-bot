/**
 * Demo Close Account Script
 *
 * Closes one of the demo token accounts to simulate the reclaim flow:
 *   1. Loads operator keypair and demo accounts from ./data/demo-accounts.json
 *   2. Burns any remaining token balance on the target ATA
 *   3. Closes the account via createCloseAccountInstruction
 *   4. Rent goes to operator wallet
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  createBurnInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.OPERATOR_KEYPAIR_PATH || './keypair.json';
const DEMO_ACCOUNTS_FILE = path.join('./data', 'demo-accounts.json');

async function main() {
  console.log('=== Kora Rent-Reclaim Bot - Close Demo Account ===\n');

  // Load operator keypair
  if (!fs.existsSync(KEYPAIR_PATH)) {
    console.error(`Keypair file not found: ${KEYPAIR_PATH}`);
    process.exit(1);
  }
  const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const operator = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Operator: ${operator.publicKey.toBase58()}`);

  // Load demo accounts
  if (!fs.existsSync(DEMO_ACCOUNTS_FILE)) {
    console.error(`Demo accounts file not found: ${DEMO_ACCOUNTS_FILE}`);
    console.error('Run "npm run demo:setup" first.');
    process.exit(1);
  }
  const demoData = JSON.parse(fs.readFileSync(DEMO_ACCOUNTS_FILE, 'utf-8'));
  console.log(`Loaded ${demoData.accounts.length} demo accounts`);

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

  // Find the operator's ATA (first account, which has tokens minted to it)
  const target = demoData.accounts[0];
  const targetPubkey = new PublicKey(target.pubkey);
  const mintPubkey = new PublicKey(target.mint);

  console.log(`\nTarget account: ${target.pubkey}`);
  console.log(`Owner: ${target.owner}`);
  console.log(`Mint: ${target.mint}`);

  // Check current state
  let tokenAccount;
  try {
    tokenAccount = await getAccount(connection, targetPubkey);
  } catch (err) {
    console.error('Account not found on-chain. It may already be closed.');
    process.exit(1);
  }

  const tokenBalance = Number(tokenAccount.amount);
  const accountInfo = await connection.getAccountInfo(targetPubkey);
  const rentLamports = accountInfo?.lamports ?? 0;

  console.log(`Token balance: ${tokenBalance}`);
  console.log(`Rent held: ${rentLamports} lamports (${rentLamports / 1e9} SOL)`);

  const tx = new Transaction();

  // Burn tokens if any remain
  if (tokenBalance > 0) {
    console.log(`\nBurning ${tokenBalance} tokens...`);
    tx.add(
      createBurnInstruction(
        targetPubkey,
        mintPubkey,
        operator.publicKey, // owner of the ATA
        tokenBalance
      )
    );
  }

  // Close the account (rent goes to operator)
  console.log('Closing account...');
  tx.add(
    createCloseAccountInstruction(
      targetPubkey,
      operator.publicKey, // destination for rent
      operator.publicKey, // authority (owner of the ATA)
      [],
      TOKEN_PROGRAM_ID
    )
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [operator]);

  console.log(`\nAccount closed successfully!`);
  console.log(`  tx: ${sig}`);
  console.log(`  Rent recovered: ${rentLamports} lamports (${rentLamports / 1e9} SOL)`);
  console.log(`  Rent sent to: ${operator.publicKey.toBase58()}`);

  console.log('\n=== Next Steps ===');
  console.log('  npm run cli -- check        # Detect the closure');
  console.log('  npm run cli -- reclaim --all # Reclaim the rent');
  console.log('  npm run cli -- history       # View reclaim history');
  console.log('  npm run cli -- report        # Generate report');
}

main().catch((err) => {
  console.error('Close failed:', err);
  process.exit(1);
});
