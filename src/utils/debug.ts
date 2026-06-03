/**
 * Debug logging for routex-sui. Off by default to keep production consoles clean,
 * but vital for diagnosing why a pool is silently returning null.
 *
 * Enable via either:
 *   - Environment variable: ROUTEX_DEBUG=1
 *   - Programmatic:         setDebug(true)
 *
 * When enabled, every silenced getQuote error is logged as:
 *   [routex-sui] <PoolName>.getQuote(SUI->USDC, 90000000n) failed: <error>
 *
 * This addresses a recurring pain point: pools wrap their SDK calls in
 * try { ... } catch { return null }. Real errors (peer-dep mismatch, SDK
 * init failure, network errors) become indistinguishable from "no liquidity".
 */

let debugEnabled = (() => {
  try {
    return typeof process !== 'undefined'
      && typeof process.env !== 'undefined'
      && (process.env.ROUTEX_DEBUG === '1' || process.env.ROUTEX_DEBUG === 'true')
  } catch { return false }
})()

export function setDebug(on: boolean): void {
  debugEnabled = on
}

export function isDebug(): boolean {
  return debugEnabled
}

export function debugWarn(scope: string, msg: string, err?: unknown): void {
  if (!debugEnabled) return
  const tail = err
    ? `: ${err instanceof Error ? err.message : String(err)}`
    : ''
  // eslint-disable-next-line no-console
  console.warn(`[routex-sui] ${scope} ${msg}${tail}`)
}
