import * as SuiTransactions from '@mysten/sui/transactions'
import { type Transaction, coinWithBalance } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'
import { debugWarn } from '../utils/debug.js'

// Quote cache entry
interface CachedQuote {
  metaQuote: any
  expiry: number
}

/**
 * Runtime check for whether 7K SDK can possibly load.
 *
 * @7kprotocol/sdk-ts's bundled code does:
 *   import { Commands as xt, Transaction as it, TransactionDataBuilder as Dt }
 *     from "@mysten/sui/transactions"
 *
 * `Commands` was removed when @mysten/sui went from v1 to v2 (the API was
 * inlined into Transaction's builder methods). So if `Commands` is missing
 * from the resolved @mysten/sui/transactions module, the dynamic import of
 * 7K will throw a SyntaxError before any of its methods can be called.
 *
 * We detect this at module load and use it to short-circuit getQuote so the
 * aggregator can fall through to other DEXes instead of silently waiting for
 * a guaranteed-to-fail import.
 */
const SEVENK_SDK_COMPATIBLE: boolean = (SuiTransactions as any).Commands != null

if (!SEVENK_SDK_COMPATIBLE) {
  debugWarn(
    'SevenKProtocolPool',
    'disabled: installed @mysten/sui has no `Commands` export ' +
    '(7K SDK requires @mysten/sui v1). Set ROUTEX_DEBUG=1 to confirm. ' +
    'See README "Sui SDK version compatibility".'
  )
}

export class SevenKProtocolPool {
  // Lazy-loaded to avoid static-import failures when the consumer's @mysten/sui
  // version doesn't match what @7kprotocol/sdk-ts was built against.
  private metaAgPromise: Promise<any> | null = null
  private quoteCache = new Map<string, CachedQuote>()
  private readonly CACHE_TTL = 30_000

  constructor(private readonly network: 'mainnet' | 'testnet') {}

  /** True when the runtime's @mysten/sui version is compatible with 7K SDK. */
  isAvailable(): boolean {
    return SEVENK_SDK_COMPATIBLE
  }

  private getMetaAg(): Promise<any> {
    if (!SEVENK_SDK_COMPATIBLE) {
      return Promise.reject(new Error(
        '7K SDK requires @mysten/sui v1; installed major is v2. ' +
        'Pool is disabled.'
      ))
    }
    if (!this.metaAgPromise) {
      this.metaAgPromise = import('@7kprotocol/sdk-ts')
        .then(mod => new mod.MetaAg())
        .catch(err => {
          this.metaAgPromise = null
          throw err
        })
    }
    return this.metaAgPromise
  }

  /** Tracks whether this instance has ever had a successful quote — used to extend
   * the timeout for cold starts. The 7K SDK internally races multiple providers
   * (bluefin7k, cetus, flowx, okx); the first invocation has to spin all of them
   * up cold, which often blows past a 5s window. After the first success the
   * SDK's internal state is warm and 2-3s is plenty. */
  private warmedUp = false

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    if (!SEVENK_SDK_COMPATIBLE) return null  // Disabled at module load; no work to do.
    try {
      const metaAg = await this.getMetaAg()
      const quotes = await metaAg.quote({
        coinTypeIn: tokenIn.type,
        coinTypeOut: tokenOut.type,
        amountIn: amountIn.toString(),
        // Cold start: 12s (gives the slowest provider room to respond at least once).
        // Warm: 5s (snappy after first success).
        timeout: this.warmedUp ? 5000 : 12_000,
      })

      if (!quotes || quotes.length === 0) return null

      // Sort by amountOut descending; prefer simulatedAmountOut when available
      const best = quotes
        .filter((q: any) => BigInt(q.amountOut) > 0n)
        .sort((a: any, b: any) => {
          const aOut = BigInt(a.simulatedAmountOut ?? a.amountOut)
          const bOut = BigInt(b.simulatedAmountOut ?? b.amountOut)
          return bOut > aOut ? 1 : bOut < aOut ? -1 : 0
        })[0]

      if (!best) return null

      const amountOut = BigInt(best.simulatedAmountOut ?? best.amountOut)
      if (amountOut === 0n) return null

      // First successful quote — collapse subsequent calls to the shorter timeout.
      this.warmedUp = true

      // Cache the best MetaQuote for PTB building
      const key = this.cacheKey(tokenIn, tokenOut, amountIn)
      this.quoteCache.set(key, { metaQuote: best, expiry: Date.now() + this.CACHE_TTL })

      // Estimate price impact from raw vs simulated amounts
      const rawOut  = BigInt(best.rawAmountOut)
      const simOut  = BigInt(best.simulatedAmountOut ?? best.rawAmountOut)
      const priceImpact = rawOut > 0n && simOut < rawOut
        ? Math.max(0, Number(rawOut - simOut) / Number(rawOut))
        : 0

      const fee = 0.003 // 0.3% default

      return {
        protocol: 'sevenkprotocol',
        poolId: `7k:${best.provider}:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee,
        priceImpact,
      }
    } catch (err) {
      debugWarn('SevenKProtocolPool', `getQuote(${tokenIn.symbol}->${tokenOut.symbol}, ${amountIn})`, err)
      return null
    }
  }

  getCachedQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): any | null {
    const entry = this.quoteCache.get(this.cacheKey(tokenIn, tokenOut, amountIn))
    if (!entry || Date.now() > entry.expiry) return null
    return entry.metaQuote
  }

  async addSwapToTransaction(
    tx: Transaction,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    senderAddress: string,
    slippageBps: number = 100,
    /** Optional intermediate coin from a previous hop. If omitted, a new coin is sourced from the wallet. */
    coinInOverride?: any,
  ): Promise<{ tx: Transaction; coinOutId: any }> {
    const metaAg = await this.getMetaAg()
    const cachedQuote = this.getCachedQuote(tokenIn, tokenOut, amountIn)
    if (!cachedQuote) {
      throw new Error('7K quote cache miss — call getQuote first.')
    }

    const coinIn = coinInOverride ?? (coinWithBalance({
      balance: amountIn,
      type: tokenIn.type,
    }) as any)

    const coinOut = await metaAg.swap(
      {
        quote: cachedQuote,
        signer: senderAddress,
        tx: tx as any,
        coinIn,
      },
      slippageBps,
    )

    return { tx, coinOutId: coinOut }
  }

  private cacheKey(tokenIn: Token, tokenOut: Token, amountIn: bigint): string {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`
  }
}
