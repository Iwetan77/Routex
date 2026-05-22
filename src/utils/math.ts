export function applySlippage(amount: bigint, slippage: number): bigint {
  return BigInt(Math.floor(Number(amount) * (1 - slippage)))
}

export function calcPriceImpact(amountIn: number, amountOut: number, spotPrice: number): number {
  if (spotPrice === 0 || amountIn === 0) return 0
  const expectedOut = amountIn * spotPrice
  return Math.max(0, (expectedOut - amountOut) / expectedOut)
}
