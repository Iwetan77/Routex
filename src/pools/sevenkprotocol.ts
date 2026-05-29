import { MetaAg } from '@7kprotocol/sdk-ts'
import { type Transaction, coinWithBalance } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'

// Quote cache entry
interface CachedQuote {
  metaQuote: any
  expiry: number
}

export class SevenKProtocolPool {
  private metaAg: MetaAg
  private quoteCache = new Map<string, CachedQuote>()
  private readonly CACHE_TTL = 30_000

  constructor(private readonly network: 'mainnet' | 'testnet') {
    // 7K only supports mainnet; testnet calls will return null
    this.metaAg = new MetaAg()
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const quotes = await this.metaAg.quote({
        coinTypeIn: tokenIn.type,
        coinTypeOut: tokenOut.type,
        amountIn: amountIn.toString(),
        timeout: 5000,
      })

      if (!quotes || quotes.length === 0) return null

      // Sort by amountOut descending; prefer simulatedAmountOut when available
      const best = quotes
        .filter(q => BigInt(q.amountOut) > 0n)
        .sort((a, b) => {
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

      // Gas fee estimate as proxy for fee (not perfect but reasonable)
      const fee = 0.003 // 0.3 % default; providers may vary

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

  /**
   * Append the 7K swap to an existing Transaction.
   * Returns the output coin argument for chaining in a PTB.
   */
  async addSwapToTransaction(
    tx: Transaction,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    senderAddress: string,
    slippageBps: number = 100,
  ): Promise<{ tx: Transaction; coinOutId: any }> {
    const cachedQuote = this.getCachedQuote(tokenIn, tokenOut, amountIn)
    if (!cachedQuote) {
      throw new Error('7K quote cache miss — call getQuote first.')
    }

    // coinWithBalance returns a type compatible at runtime; cast to any to
    // avoid the dual-package @mysten/sui type-identity conflict between this
    // project's sui@^2.x and the version bundled inside @pythnetwork (7K dep).
    const coinIn = coinWithBalance({
      balance: amountIn,
      type: tokenIn.type,
    }) as any

    const coinOut = await this.metaAg.swap(
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
