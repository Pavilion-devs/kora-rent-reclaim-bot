/**
 * Kora RPC Client
 * 
 * Connects to a Kora RPC node to get signer information and configuration.
 * Based on Kora JSON-RPC API: https://launch.solana.com/docs/kora/json-rpc-api
 */

import log from '../utils/logger';

export interface KoraConfig {
  payerSigner: string;
  paymentDestination: string;
  supportedTokens: string[];
}

export interface KoraRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Call a Kora RPC method
 */
async function callKoraRpc<T>(
  endpoint: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Kora RPC error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as KoraRpcResponse<T>;

  if (data.error) {
    throw new Error(`Kora RPC error: ${data.error.message} (code: ${data.error.code})`);
  }

  if (!data.result) {
    throw new Error('Kora RPC returned no result');
  }

  return data.result;
}

/**
 * Get the payer signer from a Kora RPC node
 * This is the address that pays for transactions (and locks rent)
 * 
 * @see https://launch.solana.com/docs/kora/json-rpc-api/methods/get-payer-signer
 */
export async function getPayerSigner(koraRpcUrl: string): Promise<{
  payerSigner: string;
  paymentDestination: string;
}> {
  log.info(`Fetching payer signer from Kora node: ${koraRpcUrl}`);

  const result = await callKoraRpc<{
    signer_address: string;
    payment_address: string;
  }>(koraRpcUrl, 'getPayerSigner', {});

  log.info(`Kora payer signer: ${result.signer_address}`);

  return {
    payerSigner: result.signer_address,
    paymentDestination: result.payment_address,
  };
}

/**
 * Get the Kora server configuration
 * 
 * @see https://launch.solana.com/docs/kora/json-rpc-api/methods/get-config
 */
export async function getKoraConfig(koraRpcUrl: string): Promise<Record<string, unknown>> {
  log.info(`Fetching config from Kora node: ${koraRpcUrl}`);

  const result = await callKoraRpc<Record<string, unknown>>(
    koraRpcUrl, 
    'getConfig', 
    {}
  );

  return result;
}

/**
 * Get supported tokens for fee payment
 * 
 * @see https://launch.solana.com/docs/kora/json-rpc-api/methods/get-supported-tokens
 */
export async function getSupportedTokens(koraRpcUrl: string): Promise<string[]> {
  log.info(`Fetching supported tokens from Kora node: ${koraRpcUrl}`);

  const result = await callKoraRpc<{ tokens: string[] }>(
    koraRpcUrl, 
    'getSupportedTokens', 
    {}
  );

  return result.tokens || [];
}

/**
 * Check if a Kora RPC node is reachable
 */
export async function isKoraNodeReachable(koraRpcUrl: string): Promise<boolean> {
  try {
    await getPayerSigner(koraRpcUrl);
    return true;
  } catch (error) {
    log.warn(`Kora node not reachable: ${koraRpcUrl}`, { error });
    return false;
  }
}

/**
 * Get full Kora node info
 */
export async function getKoraNodeInfo(koraRpcUrl: string): Promise<KoraConfig | null> {
  try {
    const [signerInfo, tokens] = await Promise.all([
      getPayerSigner(koraRpcUrl),
      getSupportedTokens(koraRpcUrl).catch(() => [] as string[]),
    ]);

    return {
      payerSigner: signerInfo.payerSigner,
      paymentDestination: signerInfo.paymentDestination,
      supportedTokens: tokens,
    };
  } catch (error) {
    log.error(`Failed to get Kora node info: ${error}`);
    return null;
  }
}

/**
 * Sign and send a transaction through Kora (Kora adds fee payer signature)
 *
 * @param koraRpcUrl - The Kora RPC endpoint
 * @param serializedTx - Base64-encoded serialized transaction (partially signed, missing fee payer sig)
 * @returns Transaction signature
 */
export async function signAndSendTransaction(
  koraRpcUrl: string,
  serializedTx: string
): Promise<string> {
  log.info('Sending transaction to Kora for signing');

  const result = await callKoraRpc<{
    signature?: string;
    signed_transaction?: string;
    signer_pubkey?: string;
  }>(
    koraRpcUrl,
    'signAndSendTransaction',
    { transaction: serializedTx }
  );

  // Kora returns signed_transaction (base64 encoded) and signer_pubkey.
  // Extract the tx signature from the first 64 bytes of the signed transaction.
  let txSignature = result.signature || '';
  if (!txSignature && result.signed_transaction) {
    const bs58 = await import('bs58');
    const txBytes = Buffer.from(result.signed_transaction, 'base64');
    // First byte is the signature count, signatures start at byte 1, each 64 bytes
    const sigBytes = txBytes.slice(1, 65);
    txSignature = bs58.default.encode(sigBytes);
  }

  log.info(`Transaction signed and sent via Kora: ${txSignature}`);
  return txSignature;
}

export default {
  getPayerSigner,
  getKoraConfig,
  getSupportedTokens,
  isKoraNodeReachable,
  getKoraNodeInfo,
  signAndSendTransaction,
};
