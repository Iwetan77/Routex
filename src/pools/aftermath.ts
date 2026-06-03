import { Aftermath, type Router, type RouterCompleteTradeRoute } from 'aftermath-ts-sdk'
import type { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions'
import type { Token, RouteStep } from '../types.js'
import { debugWarn } from '../utils/debug.js'

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

    // Aftermath SDK renamed `init()` → `bootstrap()` in 2.1.0 but older
    // versions still ship `init()`. Probe both so we work across the
    // supported version range (>=2.0.0).
    const sdkAny = this.sdk as any
    const initFn: (() => Promise<void>) | null =
      typeof sdkAny.bootstrap === 'function' ? sdkAny.bootstrap.bind(this.sdk)
      : typeof sdkAny.init === 'function'    ? sdkAny.init.bind(this.sdk)
      : null

    if (!initFn) {
      // SDK shape unknown — return rejected promise so caller logs and falls back.
      return Promise.reject(new Error(
        'Aftermath SDK has neither init() nor bootstrap(); installed version is ' +
        'incompatible. Check aftermath-ts-sdk semver in routex-sui peer deps.'
      ))
    }

    // Race init/bootstrap against a deadline so a slow Aftermath API call
    // doesn't hang the entire pathfinder. Aftermath's init() fetches the full
    // pool metadata catalog and can take 8-12 s on a cold start. After the
    // first success we cache the router, so subsequent quotes are instant.
    // 15 s gives the cold start room while still bounding the worst case.
    this.initPromise = Promise.race([
      initFn(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Aftermath init timeout')), 15_000)
      ),
    ])
      .then(() => {
        this.router = this.sdk.Router()
      })
      .catch(err => {
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

      // Issue main quote and a tiny reference quote concurrently.
      // The reference uses 1/1000th of the trade amount — small enough that its market
      // impact is negligible, so its rate ≈ the true spot rate.
      // Used as a fallback when Aftermath's spotPrice field is 0 (common for many pairs).
      const refAmountIn = amountIn / 1_000n > 0n ? amountIn / 1_000n : 1n

      // getCompleteTradeRouteGivenAmountIn calls Aftermath's router API and
      // can hang if their service is slow. Cap each call at 5 s.
      const withDeadline = <T>(p: Promise<T>): Promise<T> =>
        Promise.race([
          p,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Aftermath router timeout')), 5_000)
          ),
        ])

      const [mainResult, refResult] = await Promise.allSettled([
        withDeadline(router.getCompleteTradeRouteGivenAmountIn({
          coinInType: tokenIn.type,
          coinOutType: tokenOut.type,
          coinInAmount: amountIn,
        })),
        withDeadline(router.getCompleteTradeRouteGivenAmountIn({
          coinInType: tokenIn.type,
          coinOutType: tokenOut.type,
          coinInAmount: refAmountIn,
        })),
      ])

      if (mainResult.status === 'rejected') return null
      const route = mainResult.value

      const amountOut = BigInt(route.coinOut.amount)
      if (amountOut === 0n) return null

      // Cache route so the PTB builder can retrieve it within the 30 s window
      const key = this.cacheKey(tokenIn, tokenOut, amountIn)
      this.routeCache.set(key, { route, expiry: Date.now() + this.CACHE_TTL })

      // Work in raw base units — amountIn and amountOut share the same denomination
      // (each is in its own token's base units), so raw coinOut/coinIn is a consistent ratio.
      const rawExecutedRate = Number(amountOut) / Number(amountIn)

      let priceImpact = 0

      if (route.spotPrice > 0) {
        // Aftermath's spotPrice = "raw coinIn per raw coinOut" (inverse of executed rate).
        // Invert it to get "raw coinOut per coinIn" — the same basis as rawExecutedRate.
        const rawSpotRate = 1 / route.spotPrice
        priceImpact = Math.max(0, (rawSpotRate - rawExecutedRate) / rawSpotRate)
      } else if (refResult.status === 'fulfilled') {
        // Fallback: derive the spot rate from the tiny reference quote.
        // priceImpact = how much worse the full-size rate is vs the near-zero-impact rate.
        const refOut = Number(refResult.value.coinOut.amount)
        const refIn = Number(refAmountIn)
        if (refOut > 0 && refIn > 0) {
          const rawRefRate = refOut / refIn
          priceImpact = rawRefRate > 0
            ? Math.max(0, 1 - rawExecutedRate / rawRefRate)
            : 0
        }
      }

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
    } catch (err) {
      debugWarn('AftermathPool', `getQuote(${tokenIn.symbol}->${tokenOut.symbol}, ${amountIn})`, err)
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
  ): Promise<{ tx: Transaction; coinOutId: TransactionObjectArgument | undefined }> {
    await this.ensureInit()
    const router = this.router!

    // Aftermath serialises `tx`, sends it to their routing API, and returns a
    // BRAND NEW Transaction object — it does not mutate the one we pass in.
    // Callers must switch to the returned `tx` for all subsequent PTB work.
    const { tx: updatedTx, coinOutId } = await router.addTransactionForCompleteTradeRoute({
      tx,
      completeRoute: route,
      slippage,
      walletAddress,
      ...(coinInId !== undefined ? { coinInId } : {}),
    })

    return { tx: updatedTx, coinOutId }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private cacheKey(tokenIn: Token, tokenOut: Token, amountIn: bigint): string {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`
  }
}
