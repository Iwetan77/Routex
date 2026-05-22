import { DeepBookPool } from './pools/deepbook.js'
import { CetusPool } from './pools/cetus.js'
import { AftermathPool } from './pools/aftermath.js'
import { PoolAggregator } from './pools/aggregator.js'
import { Pathfinder } from './router/pathfinder.js'
import { PTBBuilder } from './ptb/builder.js'
import { PTBExecutor } from './ptb/executor.js'
import { resolveToken, setNetwork } from './utils/tokens.js'
import type { GetQuoteParams, ExecuteParams, ExecuteResult, RoutexQuote } from './types.js'

export class Routex {
  private aggregator: PoolAggregator
  private pathfinder: Pathfinder
  private ptbBuilder: PTBBuilder
  private executor: PTBExecutor
  private deepbookPool: DeepBookPool
  private cetusPool: CetusPool
  private aftermathPool: AftermathPool
  private network: 'mainnet' | 'testnet'

  constructor(network: 'mainnet' | 'testnet' = 'mainnet', senderAddress?: string) {
    this.network = network
    setNetwork(network)
    this.deepbookPool = new DeepBookPool(network, senderAddress)
    this.cetusPool = new CetusPool(network, senderAddress)
    this.aftermathPool = new AftermathPool(network)
    this.aggregator = new PoolAggregator(this.deepbookPool, this.cetusPool, this.aftermathPool)
    this.pathfinder = new Pathfinder(this.aggregator)
    this.ptbBuilder = new PTBBuilder(network, this.deepbookPool, this.cetusPool, this.aftermathPool)
    this.executor = new PTBExecutor(network)
  }

  setSenderAddress(address: string) {
    this.cetusPool.updateSender(address)
  }

  async getQuote(params: GetQuoteParams): Promise<RoutexQuote> {
    const quotedAt = Date.now()  // stamp before any network I/O — TTL runs from here
    const tokenIn = resolveToken(params.from)
    const tokenOut = resolveToken(params.to)
    const amountIn = BigInt(params.amount)
    const slippage = params.slippageTolerance ?? 0.005
    const senderAddress = params.senderAddress ?? '0x0000000000000000000000000000000000000000000000000000000000000001'

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

    const ptb = await this.ptbBuilder.buildFromRoute(route, senderAddress, slippage)
    const gasEstimate = await this.ptbBuilder.estimateGas(ptb, senderAddress)

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
      ptb,
      validUntil: quotedAt + 30_000,
      routeType: route.type,
    }
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    if (Date.now() > params.quote.validUntil) {
      throw new Error('Quote expired — call getQuote again.')
    }
    return this.executor.execute(params.quote.ptb, params.signer)
  }
}

export type { RoutexQuote, GetQuoteParams, ExecuteParams, ExecuteResult } from './types.js'
export { resolveToken, getTokenBySymbol } from './utils/tokens.js'
export default Routex
