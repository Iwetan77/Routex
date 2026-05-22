import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc'
import { DeepBookClient } from '@mysten/deepbook-v3'
import { testnetCoins, testnetPools, mainnetCoins, mainnetPools } from '@mysten/deepbook-v3'
import type { Token, RouteStep } from '../types.js'
import { fromBaseUnits } from '../utils/tokens.js'

// A neutral address for simulation queries (no signing needed)
const SIMULATION_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000001'

// Maps our token symbols to DeepBook's internal coin keys
const TESTNET_SYMBOL_MAP: Record<string, string> = {
  SUI: 'SUI',
  USDC: 'DBUSDC',
  DBUSDC: 'DBUSDC',
  DEEP: 'DEEP',
  WBTC: 'DBTC',
}

const MAINNET_SYMBOL_MAP: Record<string, string> = {
  SUI: 'SUI',
  USDC: 'USDC',
  DEEP: 'DEEP',
  WETH: 'WETH',
  USDT: 'USDT',
}

// Pool keys in DeepBook (base_quote format)
const TESTNET_POOL_KEYS: Record<string, string> = {
  'SUI_DBUSDC': 'SUI_DBUSDC',
  'DBUSDC_SUI': 'SUI_DBUSDC',
  'SUI_USDC': 'SUI_DBUSDC',
  'USDC_SUI': 'SUI_DBUSDC',
  'DEEP_SUI': 'DEEP_SUI',
  'SUI_DEEP': 'DEEP_SUI',
  'DEEP_DBUSDC': 'DEEP_DBUSDC',
  'DBUSDC_DEEP': 'DEEP_DBUSDC',
}

const MAINNET_POOL_KEYS: Record<string, string> = {
  'SUI_USDC': 'SUI_USDC',
  'USDC_SUI': 'SUI_USDC',
  'DEEP_USDC': 'DEEP_USDC',
  'USDC_DEEP': 'DEEP_USDC',
  'DEEP_SUI': 'DEEP_SUI',
  'SUI_DEEP': 'DEEP_SUI',
}

export class DeepBookPool {
  private client: DeepBookClient
  private suiClient: SuiClient
  private network: 'mainnet' | 'testnet'
  private symbolMap: Record<string, string>
  private poolKeyMap: Record<string, string>

  constructor(network: 'mainnet' | 'testnet' = 'testnet', address?: string) {
    this.network = network
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) })
    this.symbolMap = network === 'testnet' ? TESTNET_SYMBOL_MAP : MAINNET_SYMBOL_MAP
    this.poolKeyMap = network === 'testnet' ? TESTNET_POOL_KEYS : MAINNET_POOL_KEYS

    const coins = network === 'testnet' ? testnetCoins : mainnetCoins
    const pools = network === 'testnet' ? testnetPools : mainnetPools

    this.client = new DeepBookClient({
      client: this.suiClient as any,
      network,
      address: address ?? SIMULATION_ADDRESS,
      coins,
      pools,
    })
  }

  private getDeepBookSymbol(token: Token): string | null {
    return this.symbolMap[token.symbol.toUpperCase()] ?? null
  }

  private getPoolKey(tokenIn: Token, tokenOut: Token): string | null {
    const symIn = this.getDeepBookSymbol(tokenIn)
    const symOut = this.getDeepBookSymbol(tokenOut)
    if (!symIn || !symOut) return null
    const key = `${symIn}_${symOut}`
    return this.poolKeyMap[key] ?? null
  }

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      const poolKey = this.getPoolKey(tokenIn, tokenOut)
      if (!poolKey) return null

      const pool = this.network === 'testnet'
        ? testnetPools[poolKey as keyof typeof testnetPools]
        : mainnetPools[poolKey as keyof typeof mainnetPools]

      if (!pool) return null

      const dbSymIn = this.getDeepBookSymbol(tokenIn)!

      // Determine if we're selling the base coin or the quote coin
      const isBaseToCoin = pool.baseCoin === dbSymIn

      const amountInHuman = fromBaseUnits(amountIn, tokenIn)

      let amountOutHuman: number
      let midPrice: number

      if (isBaseToCoin) {
        // Selling base → getting quote
        const result = await this.client.getQuoteQuantityOut(poolKey, amountInHuman)
        if (result.quoteOut === 0) return null
        amountOutHuman = result.quoteOut
        midPrice = await this.client.midPrice(poolKey).catch(() => 0)
      } else {
        // Selling quote → getting base
        const result = await this.client.getBaseQuantityOut(poolKey, amountInHuman)
        if (result.baseOut === 0) return null
        amountOutHuman = result.baseOut
        const mid = await this.client.midPrice(poolKey).catch(() => 0)
        midPrice = mid > 0 ? 1 / mid : 0
      }

      const amountOut = BigInt(Math.floor(amountOutHuman * tokenOut.scalar))
      if (amountOut === 0n) return null

      // Estimate price impact: compare executed rate vs mid price
      const executedRate = amountOutHuman / amountInHuman
      const priceImpact = midPrice > 0
        ? Math.max(0, (midPrice - executedRate) / midPrice)
        : 0

      const tradeParams = await this.client.poolTradeParams(poolKey).catch(() => ({ takerFee: 0.001 }))

      return {
        protocol: 'deepbook',
        poolId: poolKey,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: tradeParams.takerFee,
        priceImpact,
      }
    } catch {
      return null
    }
  }

  // Returns the DeepBook client for PTB construction
  getDeepBookClient(): DeepBookClient {
    return this.client
  }

  getPoolKeyForPair(tokenIn: Token, tokenOut: Token): string | null {
    return this.getPoolKey(tokenIn, tokenOut)
  }

  isBaseCoin(poolKey: string, tokenIn: Token): boolean {
    const dbSym = this.getDeepBookSymbol(tokenIn)
    const pool = this.network === 'testnet'
      ? testnetPools[poolKey as keyof typeof testnetPools]
      : mainnetPools[poolKey as keyof typeof mainnetPools]
    return pool?.baseCoin === dbSym
  }
}
