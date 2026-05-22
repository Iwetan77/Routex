import type { PoolAggregator } from '../pools/aggregator.js'
import type { Token, Route, RouteStep } from '../types.js'
import { getTokenBySymbol } from '../utils/tokens.js'

// Common bridge tokens for single-hop routing
const BRIDGE_TOKENS = ['USDC', 'SUI', 'USDT', 'DBUSDC']

export class Pathfinder {
  constructor(private aggregator: PoolAggregator) {}

  async findBestRoute(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    maxHops: number = 3,
    excludeProtocols: string[] = [],
  ): Promise<Route | null> {
    const routes: Route[] = []

    // 1. Direct route
    const directStep = await this.aggregator.getBestQuote(
      tokenIn,
      tokenOut,
      amountIn,
      excludeProtocols,
    )

    if (directStep) {
      routes.push({
        steps: [directStep],
        type: 'direct',
        totalAmountOut: directStep.amountOut,
        totalPriceImpact: directStep.priceImpact,
        totalFees: directStep.fee,
      })
    }

    // 2. Single-hop routes via bridge tokens
    if (maxHops >= 2) {
      const hopResults = await Promise.allSettled(
        BRIDGE_TOKENS
          .filter(sym => sym !== tokenIn.symbol && sym !== tokenOut.symbol)
          .map(sym => this.tryHop(tokenIn, tokenOut, amountIn, sym, excludeProtocols)),
      )

      for (const r of hopResults) {
        if (r.status === 'fulfilled' && r.value) routes.push(r.value)
      }
    }

    if (routes.length === 0) return null

    return routes.reduce((best, current) =>
      current.totalAmountOut > best.totalAmountOut ? current : best,
    )
  }

  private async tryHop(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    bridgeSymbol: string,
    excludeProtocols: string[],
  ): Promise<Route | null> {
    const bridge = getTokenBySymbol(bridgeSymbol)
    if (!bridge) return null

    const leg1 = await this.aggregator.getBestQuote(tokenIn, bridge, amountIn, excludeProtocols)
    if (!leg1) return null

    const leg2 = await this.aggregator.getBestQuote(bridge, tokenOut, leg1.amountOut, excludeProtocols)
    if (!leg2) return null

    return {
      steps: [leg1, leg2],
      type: 'single-hop',
      totalAmountOut: leg2.amountOut,
      totalPriceImpact: leg1.priceImpact + leg2.priceImpact,
      totalFees: leg1.fee + leg2.fee,
    }
  }
}
