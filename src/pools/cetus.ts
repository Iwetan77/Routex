import { initCetusSDK, type CetusClmmSDK, type Pool } from '@cetusprotocol/cetus-sui-clmm-sdk'
import BN from 'bn.js'
import type { Token, RouteStep } from '../types.js'
import { fromBaseUnits } from '../utils/tokens.js'

export class CetusPool {
  private sdk: CetusClmmSDK
  private poolCache: Map<string, Pool[]> = new Map()
  private cacheExpiry: Map<string, number> = new Map()
  private readonly CACHE_TTL = 30_000 // 30 seconds

  constructor(network: 'mainnet' | 'testnet', senderAddress?: string) {
    this.sdk = initCetusSDK({
      network,
      wallet: senderAddress ?? '0x0000000000000000000000000000000000000000000000000000000000000001',
    })
  }

  updateSender(address: string) {
    this.sdk.senderAddress = address
  }

  private cacheKey(typeA: string, typeB: string): string {
    return [typeA, typeB].sort().join('|')
  }

  private async getPoolsForPair(tokenIn: Token, tokenOut: Token): Promise<Pool[]> {
    const key = this.cacheKey(tokenIn.type, tokenOut.type)
    const expiry = this.cacheExpiry.get(key) ?? 0

    if (Date.now() < expiry && this.poolCache.has(key)) {
      return this.poolCache.get(key)!
    }

    try {
      const pools = await this.sdk.Pool.getPoolByCoins([tokenIn.type, tokenOut.type])
      const active = pools.filter(p => !p.is_pause && p.liquidity > 0)
      this.poolCache.set(key, active)
      this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL)
      return active
    } catch {
      return []
    }
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
    } catch {
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
      const a2b = pool.coinTypeA === tokenIn.type
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

      // Price impact via sqrt price change
      const sqrtPriceCurrent = pool.current_sqrt_price
      const sqrtPriceAfter = Number(result.estimatedEndSqrtPrice ?? sqrtPriceCurrent)
      const priceImpact = sqrtPriceCurrent > 0
        ? Math.abs(sqrtPriceAfter - sqrtPriceCurrent) / sqrtPriceCurrent * 2
        : 0

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

  async getPoolForPair(tokenIn: Token, tokenOut: Token): Promise<Pool | null> {
    const pools = await this.getPoolsForPair(tokenIn, tokenOut)
    if (pools.length === 0) return null
    return pools.sort((a, b) => b.liquidity - a.liquidity)[0]
  }
}
