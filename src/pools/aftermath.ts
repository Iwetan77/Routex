import { Aftermath, type Router, type RouterCompleteTradeRoute } from 'aftermath-ts-sdk'
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'

// Aftermath SDK expects uppercase network strings
const NETWORK_MAP = {
  mainnet: 'MAINNET',
  testnet: 'TESTNET',
} as const satisfies Record<'mainnet' | 'testnet', 'MAINNET' | 'TESTNET'>

export class AftermathPool {
  private sdk: Aftermath
  private router: Router | null = null
  private initPromise: Promise<void> | null = null

  // Route cache: keyed by `${coinInType}_${coinOutType}_${amountIn}`
  // Expiry matches the 30 s quote TTL so the cached route is always valid for the PTB build
  private routeCache = new Map<string, { route: RouterCompleteTradeRoute; expiry: number }>()
  private readonly CACHE_TTL = 30_000

  constructor(private readonly network: 'mainnet' | 'testnet') {
    this.sdk = new Aftermath(NETWORK_MAP[network])
  }

  // ─── Lazy initialisation ──────────────────────────────────────────────────

  private ensureInit(): Promise<void> {
    if (this.router !== null) return Promise.resolve()
    if (this.initPromise) return this.initPromise

    this.initPromise = this.sdk
      .init()
      .then(() => {
        this.router = this.sdk.Router()
      })
      .catch(err => {
        // Reset so the next call retries rather than hanging forever
        this.initPromise = null
        throw err
      })

    return this.initPromise
  }

  // ─── Quote ───────────────────────────────────────────────────────────────

  async getQuote(tokenIn: Token, tokenOut: Token, amountIn: bigint): Promise<RouteStep | null> {
    try {
      await this.ensureInit()
      const router = this.router!

      const route = await router.getCompleteTradeRouteGivenAmountIn({
        coinInType: tokenIn.type,
        coinOutType: tokenOut.type,
        coinInAmount: amountIn,
      })

      const amountOut = BigInt(route.coinOut.amount)
      if (amountOut === 0n) return null

      // Cache route so the PTB builder can retrieve it within the 30 s window
      const key = this.cacheKey(tokenIn, tokenOut, amountIn)
      this.routeCache.set(key, { route, expiry: Date.now() + this.CACHE_TTL })

      // Price impact: compare executed rate against the quoted spot price
      // spotPrice is "coinOut units per coinIn unit" at current market (no-impact reference)
      const executedRate = Number(amountOut) / Number(amountIn)
      const priceImpact =
        route.spotPrice > 0
          ? Math.max(0, (route.spotPrice - executedRate) / route.spotPrice)
          : 0

      return {
        protocol: 'aftermath',
        // Synthetic poolId — Aftermath routes across multiple pools internally;
        // we store the pair identity so the builder can look up the cached route.
        poolId: `aftermath:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        // netTradeFeePercentage is expressed as a decimal (0.003 = 0.3 %)
        fee: route.netTradeFeePercentage,
        priceImpact,
      }
    } catch {
      return null
    }
  }

  // ─── Route cache access (for PTB builder) ─────────────────────────────────

  getCachedRoute(
    tokenIn: Token,
    tokenOut: Token,
    amountIn: bigint,
  ): RouterCompleteTradeRoute | null {
    const entry = this.routeCache.get(this.cacheKey(tokenIn, tokenOut, amountIn))
    if (!entry || Date.now() > entry.expiry) return null
    return entry.route
  }

  // ─── PTB construction ─────────────────────────────────────────────────────

  /**
   * Appends the Aftermath swap instructions to an existing Transaction.
   * Returns the `coinOutId` argument so it can be chained in a multi-hop PTB.
   * If `coinInId` is provided (intermediate multi-hop coin), Aftermath uses it
   * as the input rather than fetching coins from the wallet.
   */
  async addSwapToTransaction(
    tx: Transaction,
    route: RouterCompleteTradeRoute,
    slippage: number,
    walletAddress: string,
    coinInId?: TransactionObjectArgument,
  ): Promise<TransactionObjectArgument | undefined> {
    await this.ensureInit()
    const router = this.router!

    const { tx: updatedTx, coinOutId } = await router.addTransactionForCompleteTradeRoute({
      tx,
      completeRoute: route,
      slippage,
      walletAddress,
      ...(coinInId !== undefined ? { coinInId } : {}),
    })

    // `updatedTx` is the same Transaction object mutated in place; we return coinOutId for chaining
    return coinOutId
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private cacheKey(tokenIn: Token, tokenOut: Token, amountIn: bigint): string {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`
  }
}
