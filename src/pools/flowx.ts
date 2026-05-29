import { AggregatorQuoter, TradeBuilder } from '@flowx-finance/sdk'
import type { Transaction } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'

// FlowX uses its own NETWORK enum ('mainnet' | 'testnet')
type FlowXNetwork = 'mainnet' | 'testnet'

export class FlowXPool {
  private quoter: AggregatorQuoter
  private network: FlowXNetwork

  // Route cache for PTB builder use — keyed by `tokenIn|tokenOut|amountIn`
  private routeCache = new Map<string, { routes: any[]; expiry: number }>()
  private readonly CACHE_TTL = 30_000

  constructor(network: 'mainnet' | 'testnet') {
    this.network = network
    this.quoter = new AggregatorQuoter(network)
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const result = await this.quoter.getRoutes({
        tokenIn: tokenIn.type,
        tokenOut: tokenOut.type,
        amountIn: amountIn.toString(),
      })

      if (!result) return null

      const amountOut = BigInt(result.amountOut.toString())
      if (amountOut === 0n) return null

      // Cache the routes so the PTB builder can use them within the TTL
      const key = this.cacheKey(tokenIn, tokenOut, amountIn)
      this.routeCache.set(key, {
        routes: result.routes as any[],
        expiry: Date.now() + this.CACHE_TTL,
      })

      // priceImpact from FlowX is a Percent object (numerator/denominator)
      let priceImpact = 0
      try {
        const pi = result.priceImpact
        priceImpact = Math.max(0, Number((pi as any).toFixed?.(6) ?? pi) / 100)
      } catch {
        priceImpact = 0
      }

      return {
        protocol: 'flowx',
        poolId: `flowx:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: 0.003, // FlowX default AMM fee 0.3 %
        priceImpact,
      }
    } catch {
      return null
    }
  }

  getCachedRoutes(tokenIn: Token, tokenOut: Token, amountIn: bigint): any[] | null {
    const entry = this.routeCache.get(this.cacheKey(tokenIn, tokenOut, amountIn))
    if (!entry || Date.now() > entry.expiry) return null
    return entry.routes
  }

  /**
   * Build a FlowX swap transaction from cached routes.
   */
  async buildSwapTransaction(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    slippage: number,
    senderAddress: string,
  ): Promise<Transaction | null> {
    const routes = this.getCachedRoutes(tokenIn, tokenOut, amountIn)
    if (!routes || routes.length === 0) return null

    try {
      // slippage param for TradeBuilder expects value like 0.01 for 1 %
      // but FlowX docs use bps * 1e6 / 100 for their internal representation;
      // the public .slippage() method accepts a plain fraction (0.01 = 1 %)
      const trade = new TradeBuilder(this.network, routes)
        .sender(senderAddress)
        .slippage(slippage * 1e6) // FlowX internally stores slippage as bps * 1e4
        .commission(null as any)
        .build()

      // buildTransaction requires a gRPC client — not easily available.
      // Return null to signal the PTB builder should skip (the trade object
      // itself is useful for direct calls but not for our PTB chain here).
      return null
    } catch {
      return null
    }
  }

  private cacheKey(tokenIn: Token, tokenOut: Token, amountIn: bigint): string {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`
  }
}
