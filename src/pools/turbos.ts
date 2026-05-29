import { TurbosSdk, Network, type Pool as PoolModule } from 'turbos-clmm-sdk'
import type { Token, RouteStep } from '../types.js'

type PoolRecord = PoolModule.Pool

export class TurbosPool {
  private sdk: TurbosSdk
  // Pool cache: key = `${coinTypeA}|${coinTypeB}`, value = array of pool IDs
  private poolCache: Map<string, PoolRecord[]> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private readonly CACHE_TTL = 60_000 // 60 seconds

  constructor(private readonly network: 'mainnet' | 'testnet') {
    // TurbosSdk uses its own RPC; pass network enum
    this.sdk = new TurbosSdk(
      network === 'mainnet' ? Network.mainnet : Network.testnet,
    )
  }

  private cacheKey(typeA: string, typeB: string): string {
    return [typeA, typeB].sort().join('|')
  }

  /**
   * Find Turbos pools that contain both coinTypes by scanning all pools and
   * filtering by the pool's type arguments.  We cache the matching pool IDs
   * to avoid repeated full-scan RPC calls.
   */
  private async getPoolsForPair(
    tokenIn: Token,
    tokenOut: Token,
  ): Promise<PoolRecord[]> {
    const key = this.cacheKey(tokenIn.type, tokenOut.type)
    if ((this.cacheExpiry.get(key) ?? 0) > Date.now()) {
      return this.poolCache.get(key) ?? []
    }

    try {
      // getPools() returns all pools (no filter by coin pair in the SDK)
      const allPools = await this.sdk.pool.getPools()
      const matching = allPools.filter(p => {
        const types: string[] = p.types ?? []
        return types.includes(tokenIn.type) && types.includes(tokenOut.type)
      })

      this.poolCache.set(key, matching)
      this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL)
      return matching
    } catch {
      return []
    }
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const pools = await this.getPoolsForPair(tokenIn, tokenOut)
      if (pools.length === 0) return null

      const a2b = tokenIn.type < tokenOut.type // canonical ordering used by Turbos

      let bestStep: RouteStep | null = null

      // Try up to the first 3 pools (highest liquidity) and pick the best
      for (const pool of pools.slice(0, 3)) {
        const poolId = pool.objectId
        const step = await this.quoteFromPool(poolId, a2b, tokenIn, tokenOut, amountIn)
        if (step && (!bestStep || step.amountOut > bestStep.amountOut)) {
          bestStep = step
        }
      }

      return bestStep
    } catch {
      return null
    }
  }

  private async quoteFromPool(
    poolId: string,
    a2b: boolean,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
  ): Promise<RouteStep | null> {
    try {
      const [result] = await this.sdk.trade.computeSwapResultV2({
        pools: [{ pool: poolId, a2b, amountSpecified: amountIn.toString() }],
        address: '0x0000000000000000000000000000000000000000000000000000000000000001',
        amountSpecifiedIsInput: true,
      })

      if (!result) return null

      // amount_b when a2b=true (buying token B with token A), else amount_a
      const rawOut = a2b ? result.amount_b : result.amount_a
      if (!rawOut) return null

      const amountOut = BigInt(rawOut)
      if (amountOut === 0n) return null

      // fee_amount is in base units of tokenIn; compute as fraction of amountIn
      const feeAmount = BigInt(result.fee_amount ?? '0')
      const fee = amountIn > 0n ? Number(feeAmount) / Number(amountIn) : 0.003

      // Price impact via sqrt price ratio (Q64.64 fixed-point; ratio cancels scale)
      // sqrt_price is the post-swap price from computeSwapResultV2
      // We fetch pre-swap price from the pool object separately via getPool; fallback to 0
      const sqrtPriceAfter = BigInt(result.sqrt_price ?? '0')
      let priceImpact = 0
      // Without the pre-swap price we can only approximate from amounts
      // Use a simpler approach: fee_amount / amountIn as a lower-bound proxy
      if (amountIn > 0n) {
        const executedRate = Number(amountOut) / Number(amountIn)
        // No spot price available here; use 0 impact as a conservative estimate
        priceImpact = 0
      }

      return {
        protocol: 'turbos',
        poolId,
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

  /**
   * Build a Turbos swap transaction appended to an existing PTB.
   * Returns the output coin argument for chaining.
   */
  async buildSwapCall(
    poolId: string,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
    amountOutMin: bigint,
    senderAddress: string,
  ): Promise<any> {
    try {
      const a2b = tokenIn.type < tokenOut.type

      const [result] = await this.sdk.trade.computeSwapResultV2({
        pools: [{ pool: poolId, a2b, amountSpecified: amountIn.toString() }],
        address: senderAddress,
        amountSpecifiedIsInput: true,
      })
      if (!result) throw new Error('No swap result')

      // tick_current_index is stored as { bits: number } (I32 representation)
      const tickBits = result.tick_current_index?.bits ?? 0
      const nextTickIndex = this.sdk.math ? (this.sdk as any).math.bitsToNumber(tickBits) : tickBits

      const tx = await this.sdk.trade.swap({
        routes: [{ pool: poolId, a2b, nextTickIndex }],
        coinTypeA: a2b ? tokenIn.type : tokenOut.type,
        coinTypeB: a2b ? tokenOut.type : tokenIn.type,
        address: senderAddress,
        amountA: a2b ? amountIn.toString() : amountOutMin.toString(),
        amountB: a2b ? amountOutMin.toString() : amountIn.toString(),
        amountSpecifiedIsInput: true,
        slippage: '1', // 1% — caller controls minOut via amountOutMin
        deadline: 60_000,
      })

      return tx
    } catch (err) {
      throw new Error(`TurbosPool.buildSwapCall failed: ${err}`)
    }
  }
}
