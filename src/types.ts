import type { Transaction } from '@mysten/sui/transactions'

export interface Token {
  address: string
  type: string
  symbol: string
  decimals: number
  name: string
  scalar: number
}

export interface RouteStep {
  protocol: 'deepbook' | 'cetus' | 'aftermath' | 'turbos'
  poolId: string
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  amountOut: bigint
  fee: number
  priceImpact: number
}

export interface Route {
  steps: RouteStep[]
  type: 'direct' | 'single-hop' | 'multi-hop'
  totalAmountOut: bigint
  totalPriceImpact: number
  totalFees: number
}

export interface RoutexQuote {
  from: Token
  to: Token
  amountIn: bigint
  amountOut: bigint
  minimumAmountOut: bigint
  route: RouteStep[]
  priceImpact: number
  fees: {
    total: number
    breakdown: { protocol: string; fee: number }[]
  }
  gasEstimate: bigint
  ptb: Transaction
  validUntil: number
  routeType: 'direct' | 'single-hop' | 'multi-hop'
}

export interface GetQuoteParams {
  from: string
  to: string
  amount: bigint | number
  slippageTolerance?: number
  maxHops?: number
  excludeProtocols?: string[]
  preferProtocol?: string
  senderAddress?: string
}

export interface ExecuteParams {
  quote: RoutexQuote
  signer: any
}

export interface ExecuteResult {
  digest: string
  actualAmountOut: bigint
}
