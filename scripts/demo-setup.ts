/**
 * Demo Setup Script
 *
 * Creates sponsored token accounts through Kora on devnet to demonstrate
 * the full rent reclaim lifecycle:
 *   1. Creates a test mint (operator pays directly)
 *   2. Creates 2-3 Associated Token Accounts through Kora (Kora pays rent)
 *   3. Mints tokens to one ATA (so we can demo burning + closing)
 *   4. Saves created account info to ./data/demo-accounts.json
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { getPayerSigner, signAndSendTransaction } from '../src/core/kora';

const KORA_RPC_URL = process.env.KORA_RPC_URL || 'http://localhost:8082';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.OPERATOR_KEYPAIR_PATH || './keypair.json';
const DATA_DIR = './data';
const DEMO_ACCOUNTS_FILE = path.join(DATA_DIR, 'demo-accounts.json');

async function main() {
  console.log('=== Kora Rent-Reclaim Bot - Demo Setup ===\n');

  // Load operator keypair
  if (!fs.existsSync(KEYPAIR_PATH)) {
    console.error(`Keypair file not found: ${KEYPAIR_PATH}`);
    console.error('Create one with: solana-keygen new -o keypair.json');
    process.exit(1);
  }
  const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const operator = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Operator: ${operator.publicKey.toBase58()}`);

  // Connect to Solana
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const balance = await connection.getBalance(operator.publicKey);
  console.log(`Operator balance: ${balance / 1e9} SOL`);

  if (balance < 0.01 * 1e9) {
    console.error('Operator needs more SOL. Run:');
    console.error(`  solana airdrop 2 ${operator.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }

  // Connect to Kora
  console.log(`\nConnecting to Kora at ${KORA_RPC_URL}...`);
  let koraSigner: string;
  try {
    const signerInfo = await getPayerSigner(KORA_RPC_URL);
    koraSigner = signerInfo.payerSigner;
    console.log(`Kora signer: ${koraSigner}`);
  } catch (err) {
    console.error('Failed to connect to Kora node. Is it running?');
    console.error(`  Expected at: ${KORA_RPC_URL}`);
    process.exit(1);
  }

  const koraSignerPubkey = new PublicKey(koraSigner);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ── Phase 1: Create a test mint (operator pays directly) ──
  console.log('\n--- Phase 1: Creating test mint ---');
  const mintKeypair = Keypair.generate();
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: operator.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      0, // 0 decimals for simplicity
      operator.publicKey, // mint authority
      operator.publicKey  // freeze authority
    )
  );

  const mintSig = await sendAndConfirmTransaction(connection, createMintTx, [operator, mintKeypair]);
  console.log(`Mint created: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`  tx: ${mintSig}`);

  // ── Phase 2: Create ATAs through Kora (Kora pays rent as fee payer) ──
  console.log('\n--- Phase 2: Creating ATAs through Kora ---');

  const owners = [
    operator.publicKey,
    Keypair.generate().publicKey, // random owner 1
    Keypair.generate().publicKey, // random owner 2
  ];

  const atas: { pubkey: string; owner: string; mint: string; txSignature: string }[] = [];

  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i];
    const ata = await getAssociatedTokenAddress(mintKeypair.publicKey, owner);

    console.log(`\nCreating ATA #${i + 1} for owner ${owner.toBase58().slice(0, 8)}...`);
    console.log(`  ATA address: ${ata.toBase58()}`);

    // Build transaction with Kora as fee payer
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        koraSignerPubkey, // payer (Kora pays rent)
        ata,
        owner,
        mintKeypair.publicKey
      )
    );

    tx.feePayer = koraSignerPubkey;
    const latestBlockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockhash.blockhash;

    // Serialize without requiring all signatures (Kora will add fee payer sig)
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const base64Tx = serialized.toString('base64');

    // Send to Kora for signing and submission
    const txSig = await signAndSendTransaction(KORA_RPC_URL, base64Tx);
    console.log(`  tx: ${txSig}`);
    console.log(`  Fee payer: Kora (${koraSigner.slice(0, 8)}...)`);

    atas.push({
      pubkey: ata.toBase58(),
      owner: owner.toBase58(),
      mint: mintKeypair.publicKey.toBase58(),
      txSignature: txSig,
    });

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  // ── Phase 3: Mint tokens to the operator's ATA ──
  console.log('\n--- Phase 3: Minting tokens to operator ATA ---');
  const operatorAta = new PublicKey(atas[0].pubkey);

  // Wait for ATA to be confirmed on-chain
  await new Promise(r => setTimeout(r, 2000));

  const mintToTx = new Transaction().add(
    createMintToInstruction(
      mintKeypair.publicKey,
      operatorAta,
      operator.publicKey, // mint authority
      100 // mint 100 tokens
    )
  );

  const mintToSig = await sendAndConfirmTransaction(connection, mintToTx, [operator]);
  console.log(`Minted 100 tokens to ${operatorAta.toBase58().slice(0, 8)}...`);
  console.log(`  tx: ${mintToSig}`);

  // ── Save demo accounts ──
  const demoData = {
    createdAt: new Date().toISOString(),
    koraSigner,
    mint: mintKeypair.publicKey.toBase58(),
    accounts: atas,
  };

  fs.writeFileSync(DEMO_ACCOUNTS_FILE, JSON.stringify(demoData, null, 2));
  console.log(`\nDemo accounts saved to ${DEMO_ACCOUNTS_FILE}`);

  // ── Summary ──
  console.log('\n=== Setup Complete ===');
  console.log(`Mint: ${mintKeypair.publicKey.toBase58()}`);
  console.log(`ATAs created: ${atas.length}`);
  atas.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.pubkey} (owner: ${a.owner.slice(0, 8)}...)`);
  });
  console.log('\nNext steps:');
  console.log(`  npm run cli -- discover --signer ${koraSigner}`);
  console.log('  npm run cli -- list');
  console.log('  npm run demo:close');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
