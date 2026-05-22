/**
 * Routex — simple swap example
 *
 * Fetches the best SUI → USDC quote across DeepBook, Cetus, and Aftermath,
 * then optionally executes it if SUI_PRIVATE_KEY is set.
 *
 * Usage (quote only):
 *   npx tsx examples/simple-swap.ts
 *
 * Usage (quote + execute on testnet):
 *   SUI_PRIVATE_KEY=suiprivkey1... npx tsx examples/simple-swap.ts
 */

import Routex from '../src/index.js'

const NETWORK  = 'mainnet' as const
const AMOUNT   = 150_000_000n  // 0.15 SUI in MIST (9 decimals)
const PRIVKEY  = process.env.SUI_PRIVATE_KEY

async function main(): Promise<void> {
  // Derive address early so getQuote builds the PTB with the correct sender
  let keypair: any = null
  let address: string | undefined

  if (PRIVKEY) {
    const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
    keypair = Ed25519Keypair.fromSecretKey(PRIVKEY)
    address = keypair.getPublicKey().toSuiAddress()
  }

  const routex = new Routex(NETWORK)

  console.log('Fetching best SUI → USDC quote across all liquidity sources...\n')

  const quote = await routex.getQuote({
    from: 'SUI',
    to:   'USDC',
    amount: AMOUNT,
    slippageTolerance: 0.005,  // 0.5%
    senderAddress: address,
  })

  console.log('═══════════════════════════════════════')
  console.log('  Quote')
  console.log('═══════════════════════════════════════')
  console.log(`  Input :  ${Number(quote.amountIn) / 1e9} SUI`)
  console.log(`  Output:  ${(Number(quote.amountOut) / 1e6).toFixed(6)} USDC`)
  console.log(`  Min out: ${(Number(quote.minimumAmountOut) / 1e6).toFixed(6)} USDC (with 0.5% slippage)`)
  console.log(`  Route :  ${quote.routeType} — ${quote.route.map(s => s.protocol).join(' → ')}`)
  console.log(`  Impact:  ${(quote.priceImpact * 100).toFixed(4)}%`)
  console.log(`  Gas   :  ~${(Number(quote.gasEstimate) / 1e9).toFixed(6)} SUI`)
  console.log(`  Expiry:  ${new Date(quote.validUntil).toISOString()}`)

  if (quote.route.length > 1) {
    console.log('\n  Route steps:')
    for (const step of quote.route) {
      console.log(`    ${step.tokenIn.symbol} → ${step.tokenOut.symbol} via ${step.protocol}  (fee ${(step.fee * 100).toFixed(3)}%)`)
    }
  }

  console.log('\n  Fee breakdown:')
  for (const entry of quote.fees.breakdown) {
    console.log(`    ${entry.protocol}: ${(entry.fee * 100).toFixed(3)}%`)
  }

  if (!keypair) {
    console.log('\n  ─────────────────────────────────────────────────────')
    console.log('  Set SUI_PRIVATE_KEY=suiprivkey1... to execute this swap.')
    console.log('  ─────────────────────────────────────────────────────')
    return
  }

  console.log(`\n  Executing swap from wallet ${address}...`)

  const result = await routex.execute({ quote, signer: keypair })

  console.log('\n═══════════════════════════════════════')
  console.log('  Executed')
  console.log('═══════════════════════════════════════')
  console.log(`  Digest: ${result.digest}`)
  console.log(`  View  : https://suiscan.xyz/${NETWORK}/tx/${result.digest}`)
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
