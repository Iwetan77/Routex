import { Transaction } from '@mysten/sui/transactions'
import { DeepBookPool } from './pools/deepbook.js'
import { CetusPool } from './pools/cetus.js'
import { AftermathPool } from './pools/aftermath.js'
import { TurbosPool } from './pools/turbos.js'
import { FlowXPool } from './pools/flowx.js'
import { HopPool } from './pools/hop.js'
import { SevenKProtocolPool } from './pools/sevenkprotocol.js'
import { PoolAggregator } from './pools/aggregator.js'
import { Pathfinder } from './router/pathfinder.js'
import { PTBBuilder } from './ptb/builder.js'
import { PTBExecutor } from './ptb/executor.js'
import { resolveToken, setNetwork } from './utils/tokens.js'
import type { GetQuoteParams, ExecuteParams, ExecuteResult, Route, RoutexQuote } from './types.js'

export class Routex {
  private aggregator: PoolAggregator
  private pathfinder: Pathfinder
  private ptbBuilder: PTBBuilder
  private executor: PTBExecutor
  private deepbookPool: DeepBookPool
  private cetusPool: CetusPool
  private aftermathPool: AftermathPool
  private turbosPool: TurbosPool
  private flowxPool: FlowXPool
  private hopPool: HopPool
  private sevenkPool: SevenKProtocolPool
  private network: 'mainnet' | 'testnet'

  constructor(network: 'mainnet' | 'testnet' = 'mainnet', senderAddress?: string) {
    this.network = network
    setNetwork(network)
    this.deepbookPool = new DeepBookPool(network, senderAddress)
    this.cetusPool = new CetusPool(network, senderAddress)
    this.aftermathPool = new AftermathPool(network)
    this.turbosPool = new TurbosPool(network)
    this.flowxPool = new FlowXPool(network)
    this.hopPool = new HopPool(network)
    this.sevenkPool = new SevenKProtocolPool(network)
    this.aggregator = new PoolAggregator(
      this.deepbookPool,
      this.cetusPool,
      this.aftermathPool,
      this.turbosPool,
      this.hopPool,
      this.sevenkPool,
      this.flowxPool,
    )
    this.pathfinder = new Pathfinder(this.aggregator)
    this.ptbBuilder = new PTBBuilder(network, this.deepbookPool, this.cetusPool, this.aftermathPool)
    this.executor = new PTBExecutor(network)
  }

  setSenderAddress(address: string) {
    this.cetusPool.updateSender(address)
  }

  async getQuote(params: GetQuoteParams): Promise<RoutexQuote> {
    const tokenIn  = resolveToken(params.from)
    const tokenOut = resolveToken(params.to)
    const amountIn = BigInt(params.amount)
    const slippage = params.slippageTolerance ?? 0.005
    const senderAddress = params.senderAddress
      ?? '0x0000000000000000000000000000000000000000000000000000000000000001'

    const route = await this.pathfinder.findBestRoute(
      tokenIn,
      tokenOut,
      amountIn,
      params.maxHops ?? 3,
      params.excludeProtocols ?? [],
    )

    if (!route) {
      throw new Error(`No route found from ${params.from} to ${params.to}`)
    }

    // Build PTB with the real (or simulation) sender. Gas estimation is informational
    // and allowed to fall back — but buildFromRoute must succeed or we surface the error.
    // execute() always rebuilds the PTB with the real signer, so the quote's ptb is only
    // used for callers that want to inspect or pre-sign it.
    let ptb: Transaction
    let gasEstimate: bigint
    ptb = await this.ptbBuilder.buildFromRoute(route, senderAddress, slippage)
    try {
      gasEstimate = await this.ptbBuilder.estimateGas(ptb, senderAddress)
    } catch {
      gasEstimate = BigInt(5_000_000)  // 0.005 SUI fallback
    }

    return {
      from: tokenIn,
      to: tokenOut,
      amountIn,
      amountOut: route.totalAmountOut,
      minimumAmountOut: this.ptbBuilder.applySlippage(route.totalAmountOut, slippage),
      route: route.steps,
      priceImpact: route.totalPriceImpact,
      fees: {
        total: route.totalFees,
        breakdown: route.steps.map(s => ({ protocol: s.protocol, fee: s.fee })),
      },
      gasEstimate,
      slippageTolerance: slippage,
      ptb,
      validUntil: Date.now() + 30_000,
      routeType: route.type,
    }
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    if (Date.now() > params.quote.validUntil) {
      throw new Error('Quote expired — call getQuote again.')
    }

    // Derive the real sender address from the signer.
    const senderAddress: string = typeof params.signer.getPublicKey === 'function'
      ? params.signer.getPublicKey().toSuiAddress()
      : ''

    // Always rebuild the PTB with the real signer address.
    // The quote's ptb may have been built with the simulation address (when no
    // senderAddress was passed to getQuote). Aftermath's addTransactionForCompleteTradeRoute
    // fetches actual coin objects from the wallet, so it must run with the real address.
    const internalRoute: Route = {
      steps:            params.quote.route,
      type:             params.quote.routeType,
      totalAmountOut:   params.quote.amountOut,
      totalPriceImpact: params.quote.priceImpact,
      totalFees:        params.quote.fees.total,
    }

    const ptb = await this.ptbBuilder.buildFromRoute(
      internalRoute,
      senderAddress,
      params.quote.slippageTolerance,
    )

    return this.executor.execute(ptb, params.signer)
  }
}

export type { RoutexQuote, GetQuoteParams, ExecuteParams, ExecuteResult } from './types.js'
export { resolveToken, getTokenBySymbol } from './utils/tokens.js'
export default Routex
