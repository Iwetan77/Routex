/**
 * Routex — multi-asset quote tester
 *
 * Quotes several pairs and prints a clean summary table.
 * Optionally executes the first swap if SUI_PRIVATE_KEY is set.
 *
 * Usage (quotes only):
 *   npx tsx examples/test-quotes.ts
 *
 * Usage (quotes + execute the first swap):
 *   SUI_PRIVATE_KEY=suiprivkey1... npx tsx examples/test-quotes.ts
 *
 * Note: pairs where you sell a non-SUI token (e.g. DEEP → SUI) require
 * that token in your wallet. Pass SUI_PRIVATE_KEY to use your real address,
 * otherwise the simulation address is used and those pairs will show
 * "no route" if the sim address has no balance.
 */

import Routex from '../src/index.js'
import type { RoutexQuote } from '../src/index.js'

const NETWORK = 'mainnet' as const
const PRIVKEY  = process.env.SUI_PRIVATE_KEY

// ─── Pairs to quote ───────────────────────────────────────────────────────────
// [from, to, amount in base units, human label]
const PAIRS: [string, string, bigint, string][] = [
  ['SUI',  'USDC', 150_000_000n,      '0.15 SUI  → USDC'],
  ['SUI',  'USDT', 150_000_000n,      '0.15 SUI  → USDT'],
  ['SUI',  'DEEP', 1_000_000_000n,    '1 SUI     → DEEP'],
  ['SUI',  'WETH', 1_000_000_000n,    '1 SUI     → WETH'],
  // These next two need tokens in your wallet — works when SUI_PRIVATE_KEY is set
  // and your wallet holds those tokens
  ['DEEP', 'SUI',  100_000_000_000n,  '100k DEEP → SUI '],
  ['USDC', 'SUI',  5_000_000n,        '5 USDC    → SUI '],
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(quote: RoutexQuote): string {
  return (Number(quote.amountOut) / quote.to.scalar).toFixed(
    Math.min(quote.to.decimals, 6)
  )
}

function pad(s: string, n: number): string { return s.padEnd(n) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let keypair: any = null
  let address: string | undefined

  if (PRIVKEY) {
    const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
    keypair = Ed25519Keypair.fromSecretKey(PRIVKEY)
    address = keypair.getPublicKey().toSuiAddress()
    console.log(`Wallet : ${address}\n`)
  }

  const routex = new Routex(NETWORK)

  console.log('Fetching quotes...\n')
  console.log(
    pad('Pair', 20) +
    pad('Out', 18) +
    pad('Route', 28) +
    pad('Impact', 9) +
    'Fee'
  )
  console.log('─'.repeat(82))

  const valid: { label: string; quote: RoutexQuote }[] = []

  for (const [from, to, amount, label] of PAIRS) {
    try {
      const quote = await routex.getQuote({
        from,
        to,
        amount,
        slippageTolerance: 0.01,
        senderAddress: address,
      })

      const out      = `${fmt(quote)} ${to}`
      const protocol = quote.route.map(s => s.protocol).join(' → ')
      const route    = `${quote.routeType} / ${protocol}`
      const impact   = (quote.priceImpact * 100).toFixed(4) + '%'
      const fee      = (quote.fees.total * 100).toFixed(3) + '%'

      console.log(pad(label, 20) + pad(out, 18) + pad(route, 28) + pad(impact, 9) + fee)
      valid.push({ label, quote })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Shorten verbose SDK errors for display
      const display = msg.startsWith('No route') ? 'no route found' : msg.slice(0, 60)
      console.log(pad(label, 20) + `✗  ${display}`)
    }
  }

  // ─── Optional execution ────────────────────────────────────────────────────
  if (!keypair) {
    console.log('\n──────────────────────────────────────────────────────────────')
    console.log('Tip: set SUI_PRIVATE_KEY=suiprivkey1... to execute the first swap.')
    console.log('──────────────────────────────────────────────────────────────')
    return
  }

  if (valid.length === 0) {
    console.log('\nNo valid quotes to execute.')
    return
  }

  const { label, quote } = valid[0]
  console.log(`\nExecuting: ${label}`)
  console.log(`  Expected out : ${fmt(quote)} ${quote.to.symbol}`)
  console.log(`  Min out (1%) : ${(Number(quote.minimumAmountOut) / quote.to.scalar).toFixed(6)} ${quote.to.symbol}`)
  console.log(`  Gas estimate : ~${(Number(quote.gasEstimate) / 1e9).toFixed(6)} SUI`)

  const result = await routex.execute({ quote, signer: keypair })

  console.log('\n  ✓ Swap executed')
  console.log(`  Digest : ${result.digest}`)
  console.log(`  View   : https://suiscan.xyz/${NETWORK}/tx/${result.digest}`)
}

main().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
