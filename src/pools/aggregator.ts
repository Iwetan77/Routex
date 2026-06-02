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

// Belt-and-suspenders: absorb any synchronous throw or async rejection locally.
// Protocols that can hang indefinitely (Cetus, Aftermath, Turbos) handle their
// own per-operation deadlines internally — see each pool's implementation.
// Do NOT add a universal timeout here: it would kill fast API-based protocols
// (FlowX, Hop) that occasionally need 6-8 s due to network latency.
function safe(p: Promise<RouteStep | null>): Promise<RouteStep | null> {
  return p.catch(() => null)
}

/**
 * Protocols that are NOT YET wired into the PTB builder. Their SDKs return
 * standalone Transaction objects that can't be composed into our PTB chain
 * without a deeper SDK integration, so quoting through them would produce a
 * route the caller can't execute. They're always force-excluded from quoting
 * until proper PTB builders land. To opt in (e.g. for off-chain analytics),
 * call `getAllQuotes(..., excludeProtocols)` directly on the aggregator with
 * the unsupported ones left out — but do NOT execute the resulting route.
 */
const UNBUILDABLE_PROTOCOLS = ['turbos', 'flowx', 'hop'] as const

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
    // Always exclude protocols that don't have a working PTB builder yet —
    // even if the caller didn't ask. Otherwise the pathfinder could pick a
    // route that buildFromRoute() can't construct.
    const exclude = Array.from(new Set([...excludeProtocols, ...UNBUILDABLE_PROTOCOLS]))
    excludeProtocols = exclude
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
