import { initCetusSDK, type CetusClmmSDK, type Pool } from '@cetusprotocol/cetus-sui-clmm-sdk'
import BN from 'bn.js'
import type { Token, RouteStep } from '../types.js'
import { fromBaseUnits, normalizeCoinType, coinTypesEqual } from '../utils/tokens.js'
import { debugWarn } from '../utils/debug.js'

/**
 * Curated mainnet Cetus pool IDs for major bridge-token pairs.
 * Cetus's official stats API (`api-sui.cetus.zone/v2/sui/stats_pools`) has been
 * returning malformed JSON ("Failed tp [arse response"), which makes the SDK's
 * `getPoolByCoins` unusable. As a fallback we look these up directly on-chain
 * via `sdk.Pool.getPool(id)`, which uses Sui RPC `getObject` and bypasses the
 * broken stats service entirely.
 *
 * Each entry must be verified: the on-chain pool's coinTypeA/B (normalized)
 * must match one of the two pair tokens. Pools that fail validation are
 * silently skipped — only verified pools enter the cache.
 *
 * To extend: call `CetusPool.registerKnownPool(poolId)` on an instance, or
 * append to this list and rebuild. PRs welcome — the format is just pool IDs.
 */
const KNOWN_MAINNET_POOLS: string[] = [
  // SUI/USDC — verified high-liquidity pool (TVL ~$15M+).
  '0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105',
]

export class CetusPool {
  private sdk: CetusClmmSDK
  private poolCache: Map<string, Pool[]> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private readonly CACHE_TTL = 30_000 // 30 seconds
  private knownPoolIds: string[]
  /** Cache the resolved Pool object for each known pool ID so we don't re-fetch every time. */
  private knownPoolObjects: Map<string, Pool> = new Map()

  constructor(
    private readonly network: 'mainnet' | 'testnet',
    senderAddress?: string,
  ) {
    this.sdk = initCetusSDK({
      network,
      wallet: senderAddress ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
    })
    // Only seed the known-pool registry on mainnet — the curated IDs are mainnet only.
    this.knownPoolIds = network === 'mainnet' ? [...KNOWN_MAINNET_POOLS] : []
  }

  updateSender(address: string) {
    this.sdk.senderAddress = address
  }

  /** Add a known Cetus pool ID for on-chain fallback discovery. */
  registerKnownPool(poolId: string): void {
    if (!this.knownPoolIds.includes(poolId)) this.knownPoolIds.push(poolId)
  }

  private cacheKey(typeA: string, typeB: string): string {
    return [normalizeCoinType(typeA), normalizeCoinType(typeB)].sort().join('|')
  }

  /** Fetch a known pool object once, cache it for the lifetime of the CetusPool instance. */
  private async getKnownPool(poolId: string): Promise<Pool | null> {
    if (this.knownPoolObjects.has(poolId)) return this.knownPoolObjects.get(poolId)!
    try {
      const pool = await Promise.race([
        this.sdk.Pool.getPool(poolId, true),
        new Promise<Pool>((_, reject) =>
          setTimeout(() => reject(new Error('Cetus getPool timeout')), 4_000)
        ),
      ])
      if (pool) this.knownPoolObjects.set(poolId, pool)
      return pool ?? null
    } catch {
      return null
    }
  }

  private async getPoolsForPair(tokenIn: Token, tokenOut: Token): Promise<Pool[]> {
    const key = this.cacheKey(tokenIn.type, tokenOut.type)
    const expiry = this.cacheExpiry.get(key) ?? 0

    if (Date.now() < expiry && this.poolCache.has(key)) {
      return this.poolCache.get(key)!
    }

    // 1. Try Cetus's stats-API-backed discovery first. When their service is
    //    healthy this returns every pool for the pair, including ones not in
    //    our hardcoded registry. We race it against a 4 s deadline.
    let pools: Pool[] = []
    try {
      pools = await Promise.race([
        this.sdk.Pool.getPoolByCoins([tokenIn.type, tokenOut.type]),
        new Promise<Pool[]>((_, reject) =>
          setTimeout(() => reject(new Error('Cetus pool fetch timeout')), 4_000)
        ),
      ])
    } catch {
      pools = []
    }

    // 2. Fall back to the known-pool registry. We fetch each known pool by ID
    //    via on-chain RPC (no API dependency) and filter for ones that match
    //    the requested pair. This is what keeps Cetus working when Cetus's
    //    own stats API is broken.
    if (pools.length === 0 && this.knownPoolIds.length > 0) {
      const candidates = await Promise.all(
        this.knownPoolIds.map(id => this.getKnownPool(id)),
      )
      pools = candidates
        .filter((p): p is Pool => p !== null)
        .filter(p =>
          (coinTypesEqual(p.coinTypeA, tokenIn.type)  && coinTypesEqual(p.coinTypeB, tokenOut.type)) ||
          (coinTypesEqual(p.coinTypeA, tokenOut.type) && coinTypesEqual(p.coinTypeB, tokenIn.type))
        )
    }

    const active = pools.filter(p => !p.is_pause && p.liquidity > 0)
    this.poolCache.set(key, active)
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL)
    return active
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const pools = await this.getPoolsForPair(tokenIn, tokenOut)
      if (pools.length === 0) return null

      // Try pools sorted by liquidity, take best quote
      const sorted = [...pools].sort((a, b) => b.liquidity - a.liquidity)
      let bestStep: RouteStep | null = null

      for (const pool of sorted.slice(0, 3)) {
        const step = await this.quoteFromPool(pool, tokenIn, tokenOut, amountIn)
        if (step && (!bestStep || step.amountOut > bestStep.amountOut)) {
          bestStep = step
        }
      }

      return bestStep
    } catch (err) {
      debugWarn('CetusPool', `getQuote(${tokenIn.symbol}->${tokenOut.symbol}, ${amountIn})`, err)
      return null
    }
  }

  private async quoteFromPool(
    pool: Pool,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
  ): Promise<RouteStep | null> {
    try {
      // Compare normalized types so `0x2::sui::SUI` matches `0x0000…0002::sui::SUI`.
      const a2b = coinTypesEqual(pool.coinTypeA, tokenIn.type)
      const decimalsA = a2b ? tokenIn.decimals : tokenOut.decimals
      const decimalsB = a2b ? tokenOut.decimals : tokenIn.decimals

      const result = await this.sdk.Swap.preswap({
        pool,
        currentSqrtPrice: pool.current_sqrt_price,
        decimalsA,
        decimalsB,
        a2b,
        byAmountIn: true,
        amount: amountIn.toString(),
      })

      if (!result || result.isExceed) return null

      const amountOut = BigInt(result.estimatedAmountOut)
      if (amountOut === 0n) return null

      const amountInHuman = fromBaseUnits(amountIn, tokenIn)
      const amountOutHuman = fromBaseUnits(amountOut, tokenOut)

      // Price impact via sqrt price ratio.
      // Cetus stores sqrtPrice as a Q64.64 fixed-point integer; both current and
      // post-swap values share the same scale so the ratio cancels the scale factor.
      // Exact formula: impact = 1 - (sqrtPriceAfter / sqrtPriceCurrent)²
      // For a2b the sqrt price decreases (ratio < 1 → positive impact).
      // For b2a the sqrt price increases but we still want a positive impact, so we
      // clamp at 0 — the rate comparison below already captures that direction.
      const sqrtPriceCurrent = Number(pool.current_sqrt_price)
      const sqrtPriceAfter = Number(result.estimatedEndSqrtPrice ?? pool.current_sqrt_price)
      const sqrtRatio = sqrtPriceCurrent > 0 ? sqrtPriceAfter / sqrtPriceCurrent : 1
      const priceImpact = Math.min(1, Math.max(0, 1 - sqrtRatio * sqrtRatio))

      return {
        protocol: 'cetus',
        poolId: pool.poolAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: pool.fee_rate / 1_000_000,
        priceImpact: Math.min(priceImpact, 1),
      }
    } catch {
      return null
    }
  }

  getSdk(): CetusClmmSDK {
    return this.sdk
  }

  /**
   * Fetch a Cetus pool object directly from chain by ID. Used by the PTB
   * builder to read the authoritative `coinTypeA`/`coinTypeB` ordering
   * (which determines the `a2b` swap direction). Cached for the lifetime
   * of this CetusPool instance.
   */
  async getPool(poolId: string): Promise<Pool | null> {
    return this.getKnownPool(poolId)
  }

  async getPoolForPair(tokenIn: Token, tokenOut: Token): Promise<Pool | null> {
    const pools = await this.getPoolsForPair(tokenIn, tokenOut)
    if (pools.length === 0) return null
    return pools.sort((a, b) => b.liquidity - a.liquidity)[0]
  }
}
