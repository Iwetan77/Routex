import type { DeepBookPool } from './deepbook.js'
import type { CetusPool } from './cetus.js'
import type { AftermathPool } from './aftermath.js'
import type { TurbosPool } from './turbos.js'
import type { FlowXPool } from './flowx.js'
import type { HopPool } from './hop.js'
import type { SevenKProtocolPool } from './sevenkprotocol.js'
import type { Token, RouteStep } from '../types.js'

// SKIPPED: navi-aggregator-sdk                      — archived November 2024, read-only
// SKIPPED: kriya-v3-sdk                            — no documented swap quote API, last published October 2024
// SKIPPED: @scallop-io/sui-scallop-sdk             — lending SDK only, no swap quote API
// SKIPPED: @mmt-finance/clmm-sdk (Momentum)        — CLMM liquidity management SDK only, no swap quote API
// SKIPPED: @bluefin-exchange/bluefin7k-aggregator-sdk — already a transitive dep of @7kprotocol/sdk-ts;
//   7K Protocol routes through Bluefin liquidity internally. Installing it at the top level
//   causes @mysten/sui peer-dep conflicts. Bluefin coverage is provided via sevenkprotocol.

// Per-protocol deadline. Any DEX that doesn't respond within this window
// resolves to null so it's excluded from results without blocking others.
// Cetus (pool list fetch) and Aftermath (SDK init + router API) can hang for
// 30+ seconds without ever rejecting — .catch() alone is not enough.
const PROTOCOL_TIMEOUT_MS = 5_000

function safe(p: Promise<RouteStep | null>): Promise<RouteStep | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), PROTOCOL_TIMEOUT_MS)),
  ])
}

export class PoolAggregator {
  constructor(
    private deepbook: DeepBookPool,
    private cetus: CetusPool,
    private aftermath?: AftermathPool,
    // ─── Tier 1 additions ───────────────────────────────────────────────────
    private turbos?: TurbosPool,
    private hop?: HopPool,
    private sevenkprotocol?: SevenKProtocolPool,
    // ─── Tier 2 ─────────────────────────────────────────────────────────────
    private flowx?: FlowXPool,
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

    // ─── Tier 1 — Primary liquidity sources (audited, established) ───────────
    if (!excludeProtocols.includes('deepbook')) {
      queries.push(safe(this.deepbook.getQuote(tokenIn, tokenOut, amountIn)))
    }
    if (!excludeProtocols.includes('cetus')) {
      queries.push(safe(this.cetus.getQuote(tokenIn, tokenOut, amountIn)))
    }
    if (this.aftermath && !excludeProtocols.includes('aftermath')) {
      queries.push(safe(this.aftermath.getQuote(tokenIn, tokenOut, amountIn)))
    }
    if (this.turbos && !excludeProtocols.includes('turbos')) {
      queries.push(safe(this.turbos.getQuote(tokenIn, tokenOut, amountIn)))
    }
    if (this.hop && !excludeProtocols.includes('hop')) {
      queries.push(safe(this.hop.getQuote(tokenIn, tokenOut, amountIn)))
    }
    if (this.sevenkprotocol && !excludeProtocols.includes('sevenkprotocol')) {
      queries.push(safe(this.sevenkprotocol.getQuote(tokenIn, tokenOut, amountIn)))
    }

    // ─── Tier 2 — Secondary liquidity sources ────────────────────────────────
    if (this.flowx && !excludeProtocols.includes('flowx')) {
      queries.push(safe(this.flowx.getQuote(tokenIn, tokenOut, amountIn)))
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
