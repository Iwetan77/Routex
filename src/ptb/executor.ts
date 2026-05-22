import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc'
import type { Transaction } from '@mysten/sui/transactions'
import type { ExecuteResult } from '../types.js'

export class PTBExecutor {
  private client: SuiClient

  constructor(network: 'mainnet' | 'testnet') {
    this.client = new SuiClient({ url: getFullnodeUrl(network) })
  }

  async execute(ptb: Transaction, signer: any): Promise<ExecuteResult> {
    const bytes = await ptb.build({ client: this.client as any })

    let txBase64: string
    let signature: string

    if (typeof signer.signTransaction === 'function') {
      // Standard Sui Keypair (Ed25519Keypair, Secp256k1Keypair, etc.)
      // signTransaction(bytes: Uint8Array): Promise<{ bytes: string, signature: string }>
      // Both fields are base64. `bytes` is the transaction, `signature` is the full Sui
      // signature (scheme flag + sig bytes + pubkey bytes).
      const result = await signer.signTransaction(bytes)
      txBase64   = result.bytes
      signature  = result.signature
    } else if (typeof signer.signTransactionBlock === 'function') {
      // Legacy wallet adapter (Sui Wallet Standard v0)
      const result = await signer.signTransactionBlock({ transactionBlock: ptb })
      return { digest: result.digest, actualAmountOut: 0n }
    } else {
      throw new Error(
        'Signer must implement signTransaction(bytes: Uint8Array) ' +
        'or signTransactionBlock({ transactionBlock }). ' +
        'Pass an Ed25519Keypair or a Sui wallet adapter.',
      )
    }

    const result = await this.client.executeTransactionBlock({
      transactionBlock: txBase64,
      signature: [signature],
      options: { showEffects: true, showObjectChanges: true },
    })

    if (result.effects?.status.status !== 'success') {
      throw new Error(`Transaction failed: ${result.effects?.status.error ?? 'unknown error'}`)
    }

    return {
      digest: result.digest,
      actualAmountOut: 0n, // parsing coin changes from effects is left for a later pass
    }
  }
}
