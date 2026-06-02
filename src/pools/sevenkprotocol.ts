import { type Transaction, coinWithBalance } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'

// Quote cache entry
interface CachedQuote {
  metaQuote: any
  expiry: number
}

export class SevenKProtocolPool {
  // Lazy-loaded to avoid static-import failures when the consumer's @mysten/sui
  // version doesn't match what @7kprotocol/sdk-ts was built against.
  private metaAgPromise: Promise<any> | null = null
  private quoteCache = new Map<string, CachedQuote>()
  private readonly CACHE_TTL = 30_000

  constructor(private readonly network: 'mainnet' | 'testnet') {}

  private getMetaAg(): Promise<any> {
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

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const metaAg = await this.getMetaAg()
      const quotes = await metaAg.quote({
        coinTypeIn: tokenIn.type,
        coinTypeOut: tokenOut.type,
        amountIn: amountIn.toString(),
        timeout: 5000,
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
    } catch {
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
