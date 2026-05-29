import { HopApi } from '@hop.ag/sdk'
import type { Token, RouteStep } from '../types.js'
import type { QuoteResponse } from '@hop.ag/sdk'

// Mainnet RPC URL — Hop uses this for on-chain building only
const SUI_MAINNET_RPC = 'https://fullnode.mainnet.sui.io:443'

export class HopPool {
  private sdk: HopApi

  // Cache quote responses for PTB building
  private quoteCache = new Map<string, { quote: QuoteResponse; expiry: number }>()
  private readonly CACHE_TTL = 30_000

  constructor(_network: 'mainnet' | 'testnet') {
    // Hop aggregates mainnet only; testnet requests will just return null
    this.sdk = new HopApi({
      sui_rpc_url: SUI_MAINNET_RPC,
      fee_bps: 0,
      fee_address: '',
    })
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const result = await this.sdk.quote({
        coin_in: tokenIn.type,
        coin_out: tokenOut.type,
        amount_in: amountIn,
      })

      if (!result || result.amount_out === 0) return null

      const amountOut = BigInt(Math.floor(result.amount_out))
      if (amountOut === 0n) return null

      // Cache for PTB builder
      const key = this.cacheKey(tokenIn, tokenOut, amountIn)
      this.quoteCache.set(key, { quote: result, expiry: Date.now() + this.CACHE_TTL })

      // price_impact is already a decimal fraction (e.g. 0.002 = 0.2 %)
      const priceImpact = Math.max(0, Math.min(1, result.price_impact ?? 0))

      // Derive a weighted average fee from the route legs
      let fee = 0.003 // fallback
      try {
        const totalIn = result.amount_in
        if (totalIn > 0 && result.routes.length > 0) {
          let weightedFee = 0
          let totalWeight = 0
          for (const route of result.routes) {
            const weight = route.amount_in / totalIn
            for (const leg of route.legs) {
              const legFee = leg.splits.reduce(
                (acc, s) => acc + s.fee_rate * (s.amount_in / (leg.total_in || 1)),
                0,
              )
              weightedFee += legFee * weight
              totalWeight += weight
            }
          }
          if (totalWeight > 0) fee = weightedFee / totalWeight
        }
      } catch {
        fee = 0.003
      }

      return {
        protocol: 'hop',
        poolId: `hop:${tokenIn.type}:${tokenOut.type}`,
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

  getCachedQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): QuoteResponse | null {
    const entry = this.quoteCache.get(this.cacheKey(tokenIn, tokenOut, amountIn))
    if (!entry || Date.now() > entry.expiry) return null
    return entry.quote
  }

  getSdk(): HopApi {
    return this.sdk
  }

  private cacheKey(tokenIn: Token, tokenOut: Token, amountIn: bigint): string {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`
  }
}
