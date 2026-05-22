import type { DeepBookPool } from './deepbook.js'
import type { CetusPool } from './cetus.js'
import type { AftermathPool } from './aftermath.js'
import type { Token, RouteStep } from '../types.js'

export class PoolAggregator {
  constructor(
    private deepbook: DeepBookPool,
    private cetus: CetusPool,
    private aftermath?: AftermathPool,
  ) {}

  async getBestQuote(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    excludeProtocols: string[] = [],
  ): Promise<RouteStep | null> {
    const quotes = await this.getAllQuotes(tokenIn, tokenOut, amountIn, excludeProtocols)
    return quotes[0] ?? null
  }

  async getAllQuotes(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    excludeProtocols: string[] = [],
  ): Promise<RouteStep[]> {
    const queries: Promise<RouteStep | null>[] = []

    if (!excludeProtocols.includes('deepbook')) {
      queries.push(this.deepbook.getQuote(tokenIn, tokenOut, amountIn))
    }
    if (!excludeProtocols.includes('cetus')) {
      queries.push(this.cetus.getQuote(tokenIn, tokenOut, amountIn))
    }
    if (this.aftermath && !excludeProtocols.includes('aftermath')) {
      queries.push(this.aftermath.getQuote(tokenIn, tokenOut, amountIn))
    }

    const results = await Promise.allSettled(queries)

    return results
      .filter((r): r is PromiseFulfilledResult<RouteStep> =>
        r.status === 'fulfilled' && r.value !== null,
      )
      .map(r => r.value)
      .sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0))
  }
}
