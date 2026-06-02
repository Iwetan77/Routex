import type { PoolAggregator } from '../pools/aggregator.js'
import type { Token, Route, RouteStep } from '../types.js'
import { getTokenBySymbol } from '../utils/tokens.js'

// Common bridge tokens for single-hop routing
const BRIDGE_TOKENS = ['USDC', 'SUI', 'USDT', 'DBUSDC']

// Per-hop deadline — a hop makes 2 sequential getBestQuote calls, each up to
// ~5 s (7K internal timeout), so worst-case ~10 s per hop.
// Cap at 6 s: any promising bridge leg resolves in 1-3 s; if nothing responds
// by 6 s the direct route (which completes in ~5 s) is already the winner.
const HOP_TIMEOUT_MS = 6_000

export class Pathfinder {
  constructor(private aggregator: PoolAggregator) {}

  async findBestRoute(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    maxHops: number = 3,
    excludeProtocols: string[] = [],
  ): Promise<Route | null> {
    // First attempt — most calls succeed here.
    let result = await this.findBestRouteOnce(tokenIn, tokenOut, amountIn, maxHops, excludeProtocols)
    if (result) return result

    // Cold-start retry: the very first call after a Routex instance is created
    // can return null even for highly liquid pairs because DEX SDKs (7K, Aftermath,
    // Cetus) all initialize on demand and their inner provider races miss the
    // 5–6 s deadline. By the time control returns here the SDKs are warm, so a
    // single retry with the now-cached state usually succeeds. This is a one-shot
    // tax — once any quote has succeeded, every subsequent call hits the fast
    // path immediately.
    result = await this.findBestRouteOnce(tokenIn, tokenOut, amountIn, maxHops, excludeProtocols)
    return result
  }

  private async findBestRouteOnce(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    maxHops: number,
    excludeProtocols: string[],
  ): Promise<Route | null> {
    const bridgeSymbols = maxHops >= 2
      ? BRIDGE_TOKENS.filter(sym => sym !== tokenIn.symbol && sym !== tokenOut.symbol)
      : []

    // Run direct quote and all bridge-hop attempts concurrently.
    const [directStep, ...hopRoutes] = await Promise.all([
      this.aggregator.getBestQuote(tokenIn, tokenOut, amountIn, excludeProtocols),
      ...bridgeSymbols.map(sym =>
        this.tryHop(tokenIn, tokenOut, amountIn, sym, excludeProtocols)
      ),
    ])

    const routes: Route[] = []

    if (directStep) {
      routes.push({
        steps: [directStep],
        type: 'direct',
        totalAmountOut: directStep.amountOut,
        totalPriceImpact: directStep.priceImpact,
        totalFees: directStep.fee,
      })
    }

    for (const route of hopRoutes) {
      if (route) routes.push(route)
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

    try {
      return await Promise.race([
        this._tryHopInternal(tokenIn, tokenOut, amountIn, bridge, excludeProtocols),
        new Promise<null>(resolve => setTimeout(() => resolve(null), HOP_TIMEOUT_MS)),
      ])
    } catch {
      return null
    }
  }

  private async _tryHopInternal(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    bridge: Token,
    excludeProtocols: string[],
  ): Promise<Route | null> {
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
