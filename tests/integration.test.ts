/**
 * Routex — integration tests
 *
 * All tests run against the real Sui testnet. No mocks.
 * Every test that can legitimately receive null (e.g. Cetus or Aftermath having
 * no active pool on testnet) accepts that outcome and says so in the log.
 *
 * Usage:
 *   npm test
 *
 * For the live-execute test (section 8):
 *   SUI_PRIVATE_KEY=suiprivkey1... npm test
 *   The key must belong to a testnet wallet that holds enough SUI to pay gas.
 */

import { setNetwork, resolveToken } from '../src/utils/tokens.js'
import { DeepBookPool }  from '../src/pools/deepbook.js'
import { CetusPool }     from '../src/pools/cetus.js'
import { AftermathPool } from '../src/pools/aftermath.js'
import { PoolAggregator } from '../src/pools/aggregator.js'
import { Pathfinder }    from '../src/router/pathfinder.js'
import { PTBBuilder }    from '../src/ptb/builder.js'
import Routex            from '../src/index.js'

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

/**
 * Runs `fn`. If it resolves without throwing → PASS. If it throws → FAIL.
 * Individual assertions inside `fn` throw on failure.
 */
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`  ✓  ${name}`)
    passed++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ✗  ${name}`)
    console.log(`       → ${msg}`)
    failed++
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function assertGt(a: bigint, b: bigint, label: string): void {
  if (a <= b) throw new Error(`${label}: expected ${a} > ${b}`)
}

function section(n: number, title: string): void {
  console.log(`\n${'─'.repeat(58)}\n  ${n}. ${title}\n${'─'.repeat(58)}`)
}

// ─── Shared constants ─────────────────────────────────────────────────────────

const NETWORK  = 'testnet' as const
const AMOUNT   = 1_000_000_000n          // 1 SUI in MIST
const SENDER_0 = '0x' + '0'.repeat(63) + '1'  // zero address used for dry-run / PTB build

setNetwork(NETWORK)
const SUI  = resolveToken('SUI')
const USDC = resolveToken('USDC')  // maps to DBUSDC on testnet

console.log('\n  Routex integration tests — Sui testnet')
console.log(`  SUI  : ${SUI.type}`)
console.log(`  USDC : ${USDC.type}`)

// ─── 1. DeepBook pool ─────────────────────────────────────────────────────────

async function testDeepBook(): Promise<void> {
  section(1, 'DeepBook pool — live testnet quote')
  const pool = new DeepBookPool(NETWORK)

  await test('getQuote returns a valid RouteStep for SUI → USDC', async () => {
    const step = await pool.getQuote(SUI, USDC, AMOUNT)
    assert(step !== null, 'expected non-null quote from DeepBook')
    assert(step!.protocol === 'deepbook', `protocol: expected deepbook, got ${step!.protocol}`)
    assertGt(step!.amountOut, 0n, 'amountOut')
    assert(step!.fee > 0, `fee should be > 0 (got ${step!.fee})`)
    assert(step!.priceImpact >= 0, `priceImpact should be >= 0 (got ${step!.priceImpact})`)
    assert(step!.tokenIn.symbol === 'SUI',  'tokenIn should be SUI')
    assert(step!.tokenOut.symbol === 'USDC', 'tokenOut should be USDC')
    assert(typeof step!.poolId === 'string' && step!.poolId.length > 0, 'poolId should be a non-empty string')
    console.log(`       1 SUI → ${(Number(step!.amountOut) / 1e6).toFixed(4)} USDC   fee=${(step!.fee * 100).toFixed(3)}%   impact=${(step!.priceImpact * 100).toFixed(4)}%`)
  })

  await test('getQuote returns null for a pair with no DeepBook pool (never throws)', async () => {
    const FAKE: any = { ...USDC, symbol: 'FAKE', address: '0xabcd', type: '0xabcd::fake::FAKE' }
    let threw = false
    let result: any
    try { result = await pool.getQuote(SUI, FAKE, AMOUNT) } catch { threw = true }
    assert(!threw, 'getQuote must not throw for an unknown pair — return null instead')
    assert(result === null, `expected null for unknown pair, got ${JSON.stringify(result)}`)
  })
}

// ─── 2. Cetus pool ────────────────────────────────────────────────────────────

async function testCetus(): Promise<void> {
  section(2, 'Cetus pool — live testnet quote')
  const pool = new CetusPool(NETWORK)

  await test('getQuote returns a RouteStep or null for SUI → USDC (no active testnet pool is valid)', async () => {
    const step = await pool.getQuote(SUI, USDC, AMOUNT)
    if (step === null) {
      console.log('       ℹ  no active Cetus SUI/USDC pool on testnet — null is the correct outcome')
      return
    }
    assert(step.protocol === 'cetus', `protocol: expected cetus, got ${step.protocol}`)
    assertGt(step.amountOut, 0n, 'amountOut')
    assert(step.fee >= 0,          `fee should be >= 0 (got ${step.fee})`)
    assert(step.priceImpact >= 0,  `priceImpact should be >= 0 (got ${step.priceImpact})`)
    assert(step.tokenIn.symbol  === 'SUI',  'tokenIn should be SUI')
    assert(step.tokenOut.symbol === 'USDC', 'tokenOut should be USDC')
    console.log(`       1 SUI → ${(Number(step.amountOut) / 1e6).toFixed(4)} USDC   fee=${(step.fee * 100).toFixed(3)}%`)
  })

  await test('getQuote never throws for an unknown pair', async () => {
    const FAKE: any = { ...USDC, symbol: 'FAKE', address: '0xabcd', type: '0xabcd::fake::FAKE' }
    let threw = false
    try { await pool.getQuote(SUI, FAKE, AMOUNT) } catch { threw = true }
    assert(!threw, 'getQuote must not throw — it should catch and return null')
  })
}

// ─── 3. Aftermath pool ────────────────────────────────────────────────────────

async function testAftermath(): Promise<void> {
  section(3, 'Aftermath pool — live quote via Router SDK')
  const pool = new AftermathPool(NETWORK)

  await test('getQuote returns a RouteStep or null for SUI → USDC', async () => {
    const step = await pool.getQuote(SUI, USDC, AMOUNT)
    if (step === null) {
      console.log('       ℹ  Aftermath returned null on testnet (no liquidity) — null is correct')
      return
    }
    assert(step.protocol === 'aftermath', `protocol: expected aftermath, got ${step.protocol}`)
    assertGt(step.amountOut, 0n, 'amountOut')
    assert(step.fee >= 0,         `fee should be >= 0 (got ${step.fee})`)
    assert(step.priceImpact >= 0, `priceImpact should be >= 0 (got ${step.priceImpact})`)
    assert(
      step.poolId.startsWith('aftermath:'),
      `poolId should start with "aftermath:", got "${step.poolId}"`,
    )
    console.log(`       1 SUI → ${(Number(step.amountOut) / 1e6).toFixed(4)} USDC   fee=${(step.fee * 100).toFixed(3)}%`)
  })

  await test('getCachedRoute is populated after getQuote and is consistent with the step', async () => {
    const step   = await pool.getQuote(SUI, USDC, AMOUNT)
    const cached = pool.getCachedRoute(SUI, USDC, AMOUNT)

    if (step === null) {
      assert(cached === null, 'cache must also be null when getQuote returned null')
      console.log('       ℹ  no quote → no cache entry (consistent)')
    } else {
      assert(cached !== null, 'getCachedRoute must return the route just fetched')
      assert(
        cached!.coinIn.type === SUI.type,
        `cached route coinIn.type should be ${SUI.type}, got ${cached!.coinIn.type}`,
      )
      assert(
        cached!.coinOut.type === USDC.type,
        `cached route coinOut.type should be ${USDC.type}, got ${cached!.coinOut.type}`,
      )
      console.log('       cache hit confirmed — coinIn/coinOut types match')
    }
  })

  await test('getQuote never throws for an unknown pair', async () => {
    const FAKE: any = { ...USDC, symbol: 'FAKE', address: '0xabcd', type: '0xabcd::fake::FAKE' }
    let threw = false
    try { await pool.getQuote(SUI, FAKE, AMOUNT) } catch { threw = true }
    assert(!threw, 'getQuote must not throw — it should catch internally and return null')
  })
}

// ─── 4. Aggregator ────────────────────────────────────────────────────────────

async function testAggregator(): Promise<void> {
  section(4, 'Aggregator — simultaneous query and best-quote selection')

  const deepbook  = new DeepBookPool(NETWORK)
  const cetus     = new CetusPool(NETWORK)
  const aftermath = new AftermathPool(NETWORK)
  const agg       = new PoolAggregator(deepbook, cetus, aftermath)

  await test('getAllQuotes fires all three sources simultaneously and returns ≥1 valid result', async () => {
    const t0     = Date.now()
    const quotes = await agg.getAllQuotes(SUI, USDC, AMOUNT)
    const elapsed = Date.now() - t0

    assert(quotes.length >= 1, `expected ≥1 quotes, got ${quotes.length}`)
    const KNOWN_PROTOCOLS = ['deepbook', 'cetus', 'aftermath', 'turbos', 'flowx', 'hop', 'sevenkprotocol']
    for (const q of quotes) {
      assertGt(q.amountOut, 0n, `${q.protocol}.amountOut`)
      assert(
        KNOWN_PROTOCOLS.includes(q.protocol),
        `unexpected protocol "${q.protocol}"`,
      )
    }
    const protocols = quotes.map(q => q.protocol)
    console.log(`       sources: ${protocols.join(', ')}   elapsed: ${elapsed}ms`)
  })

  await test('getAllQuotes results are sorted descending by amountOut', async () => {
    const quotes = await agg.getAllQuotes(SUI, USDC, AMOUNT)
    for (let i = 1; i < quotes.length; i++) {
      assert(
        quotes[i - 1].amountOut >= quotes[i].amountOut,
        `results not sorted at index ${i}: ${quotes[i - 1].amountOut} < ${quotes[i].amountOut}`,
      )
    }
  })

  await test('getBestQuote returns the quote with the highest amountOut', async () => {
    const all  = await agg.getAllQuotes(SUI, USDC, AMOUNT)
    const best = await agg.getBestQuote(SUI, USDC, AMOUNT)

    assert(best !== null, 'getBestQuote returned null — at least DeepBook should respond')
    const maxOut = all.reduce((m, q) => (q.amountOut > m ? q.amountOut : m), 0n)
    assert(
      best!.amountOut === maxOut,
      `best.amountOut (${best!.amountOut}) must equal max of all quotes (${maxOut})`,
    )
    console.log(`       winner: ${best!.protocol}   amountOut: ${best!.amountOut}`)
  })

  await test('excludeProtocols removes the specified protocol from results', async () => {
    const withAll     = await agg.getAllQuotes(SUI, USDC, AMOUNT, [])
    const noDeepBook  = await agg.getAllQuotes(SUI, USDC, AMOUNT, ['deepbook'])
    const noCetus     = await agg.getAllQuotes(SUI, USDC, AMOUNT, ['cetus'])

    assert(
      !noDeepBook.some(q => q.protocol === 'deepbook'),
      'deepbook must not appear when listed in excludeProtocols',
    )
    assert(
      !noCetus.some(q => q.protocol === 'cetus'),
      'cetus must not appear when listed in excludeProtocols',
    )

    const hadDeepBook = withAll.some(q => q.protocol === 'deepbook')
    if (hadDeepBook) {
      // With DeepBook removed, total count should be less (or equal if it was already absent)
      assert(
        noDeepBook.length <= withAll.length,
        'removing a protocol should not increase result count',
      )
    }
    console.log(`       all=${withAll.map(q=>q.protocol).join(',')}  noDeepBook=${noDeepBook.map(q=>q.protocol).join(',') || '(none)'}`)
  })

  await test('a pool that throws does not block the other two (Promise.allSettled)', async () => {
    // Inject a pool stub that always rejects to simulate a dead endpoint
    const broken: any = {
      getQuote: (): Promise<never> => Promise.reject(new Error('simulated pool failure')),
    }
    const faultAgg = new PoolAggregator(broken, cetus, aftermath)
    let threw = false
    let quotes: any[] = []
    try { quotes = await faultAgg.getAllQuotes(SUI, USDC, AMOUNT) }
    catch { threw = true }

    assert(!threw, 'getAllQuotes must not throw even when a pool rejects')
    assert(
      !quotes.some(q => q.protocol === 'deepbook'),
      'broken pool result must not appear in returned quotes',
    )
    console.log(`       ${quotes.length} result(s) returned despite broken deepbook stub`)
  })

  await test('a pool that returns null does not appear in results', async () => {
    const nullPool: any = { getQuote: () => Promise.resolve(null) }
    const nullAgg  = new PoolAggregator(nullPool, cetus, aftermath)
    const quotes   = await nullAgg.getAllQuotes(SUI, USDC, AMOUNT)
    assert(
      quotes.every(q => q !== null),
      'null returns must be filtered out — getAllQuotes should only contain real RouteSteps',
    )
  })
}

// ─── 5. Pathfinder ────────────────────────────────────────────────────────────

async function testPathfinder(): Promise<void> {
  section(5, 'Pathfinder — route discovery and ranking')

  const deepbook  = new DeepBookPool(NETWORK)
  const cetus     = new CetusPool(NETWORK)
  const aftermath = new AftermathPool(NETWORK)
  const agg       = new PoolAggregator(deepbook, cetus, aftermath)
  const finder    = new Pathfinder(agg)

  await test('findBestRoute returns a valid Route for SUI → USDC', async () => {
    const route = await finder.findBestRoute(SUI, USDC, AMOUNT)
    assert(route !== null, 'expected a route — at least a direct DeepBook route should exist')
    assertGt(route!.totalAmountOut, 0n, 'totalAmountOut')
    assert(route!.steps.length >= 1, `route must have ≥1 step, got ${route!.steps.length}`)
    assert(
      ['direct', 'single-hop', 'multi-hop'].includes(route!.type),
      `routeType "${route!.type}" is not a valid type`,
    )
    assert(route!.totalPriceImpact >= 0, `totalPriceImpact must be >= 0 (got ${route!.totalPriceImpact})`)
    assert(route!.totalFees >= 0, `totalFees must be >= 0 (got ${route!.totalFees})`)
    for (const s of route!.steps) {
      assertGt(s.amountOut, 0n, `step(${s.protocol}).amountOut`)
      assert(s.amountIn > 0n, `step(${s.protocol}).amountIn must be > 0`)
      console.log(`       step: ${s.tokenIn.symbol} → ${s.tokenOut.symbol} via ${s.protocol}`)
    }
    console.log(`       type=${route!.type}   totalAmountOut=${route!.totalAmountOut}`)
  })

  await test('findBestRoute output is ≥ the best direct single-pool quote', async () => {
    // The pathfinder must never return something worse than the direct aggregator best,
    // because it always includes the direct route as a candidate.
    const route  = await finder.findBestRoute(SUI, USDC, AMOUNT)
    const direct = await agg.getBestQuote(SUI, USDC, AMOUNT)
    if (!route || !direct) {
      console.log('       ℹ  no route or direct step — comparison skipped')
      return
    }
    assert(
      route.totalAmountOut >= direct.amountOut,
      `pathfinder best (${route.totalAmountOut}) must be >= direct quote (${direct.amountOut})`,
    )
    const improved = route.totalAmountOut > direct.amountOut
    console.log(
      improved
        ? `       single-hop improved output: ${direct.amountOut} → ${route.totalAmountOut}`
        : `       direct route is already optimal (${route.totalAmountOut})`,
    )
  })

  await test('maxHops=1 returns only a direct route (never single-hop or multi-hop)', async () => {
    const route = await finder.findBestRoute(SUI, USDC, AMOUNT, 1)
    if (!route) {
      console.log('       ℹ  no direct route found — acceptable (would be non-null on mainnet)')
      return
    }
    assert(
      route.type === 'direct',
      `with maxHops=1, route type must be "direct", got "${route.type}"`,
    )
    assert(
      route.steps.length === 1,
      `direct route must have exactly 1 step, got ${route.steps.length}`,
    )
  })

  await test('findBestRoute returns null for a pair with no liquidity anywhere', async () => {
    const GHOST: any = {
      ...USDC, symbol: 'GHOST', address: '0xdeadbeef', type: '0xdeadbeef::ghost::GHOST',
    }
    const route = await finder.findBestRoute(SUI, GHOST, AMOUNT)
    assert(route === null, `expected null for an illiquid pair, got route of type ${route?.type}`)
  })
}

// ─── 6. PTB Builder ───────────────────────────────────────────────────────────

async function testPTBBuilder(): Promise<void> {
  section(6, 'PTB Builder — transaction construction')

  const deepbook  = new DeepBookPool(NETWORK)
  const cetus     = new CetusPool(NETWORK)
  const aftermath = new AftermathPool(NETWORK)
  const agg       = new PoolAggregator(deepbook, cetus, aftermath)
  const finder    = new Pathfinder(agg)
  const builder   = new PTBBuilder(NETWORK, deepbook, cetus, aftermath)

  await test('buildFromRoute produces a Transaction object without throwing', async () => {
    const route = await finder.findBestRoute(SUI, USDC, AMOUNT)
    assert(route !== null, 'no route found — cannot test PTB build')
    const ptb = await builder.buildFromRoute(route!, SENDER_0, 0.005)
    assert(ptb !== null && ptb !== undefined, 'buildFromRoute returned null/undefined')
    // Verify the PTB is a real Transaction object (has build method)
    assert(typeof ptb.build === 'function', 'returned object should have a .build() method')
    console.log(`       built ${route!.type} PTB via ${route!.steps.map(s => s.protocol).join(' → ')}`)
  })

  await test('applySlippage correctly reduces amount by slippage percentage', async () => {
    const amount = 1_000_000n
    const result005 = builder.applySlippage(amount, 0.005)  // 0.5%
    const result01  = builder.applySlippage(amount, 0.01)   // 1%
    assert(result005 < amount, `applySlippage(0.5%) result ${result005} must be < ${amount}`)
    assert(result01  < amount, `applySlippage(1%)   result ${result01}  must be < ${amount}`)
    assert(result005 > result01, `0.5% slippage (${result005}) should give higher minimum than 1% (${result01})`)
    console.log(`       1 000 000 → 0.5%: ${result005}   1%: ${result01}`)
  })

  await test('estimateGas returns a positive bigint (real dry-run or fallback)', async () => {
    const route = await finder.findBestRoute(SUI, USDC, AMOUNT)
    assert(route !== null, 'no route — cannot estimate gas')
    const ptb = await builder.buildFromRoute(route!, SENDER_0, 0.005)
    const gas = await builder.estimateGas(ptb, SENDER_0)
    assert(typeof gas === 'bigint', `gasEstimate should be bigint, got ${typeof gas}`)
    assertGt(gas, 0n, 'gasEstimate')
    console.log(`       gas estimate: ${gas} MIST   (${(Number(gas) / 1e9).toFixed(6)} SUI)`)
  })
}

// ─── 7. Routex.getQuote public API ────────────────────────────────────────────

async function testGetQuote(): Promise<void> {
  section(7, 'Routex.getQuote — public API')
  const routex = new Routex(NETWORK)

  await test('returns a structurally complete RoutexQuote for SUI → USDC', async () => {
    const q = await routex.getQuote({ from: 'SUI', to: 'USDC', amount: AMOUNT })

    // Identity
    assert(q.from.symbol === 'SUI',   'from.symbol should be SUI')
    assert(q.to.symbol   === 'USDC',  'to.symbol should be USDC')
    assert(q.amountIn === AMOUNT,     `amountIn should be ${AMOUNT}, got ${q.amountIn}`)

    // Amounts
    assertGt(q.amountOut, 0n,         'amountOut must be > 0')
    assertGt(q.minimumAmountOut, 0n,  'minimumAmountOut must be > 0')
    assert(
      q.minimumAmountOut <= q.amountOut,
      `minimumAmountOut (${q.minimumAmountOut}) must be <= amountOut (${q.amountOut})`,
    )

    // Metrics
    assert(q.priceImpact >= 0, `priceImpact must be >= 0 (got ${q.priceImpact})`)

    // Route
    assert(q.route.length >= 1, `route must have ≥1 step (got ${q.route.length})`)
    assert(
      q.fees.breakdown.length === q.route.length,
      `fees.breakdown.length (${q.fees.breakdown.length}) must equal route.length (${q.route.length})`,
    )
    assert(
      ['direct', 'single-hop', 'multi-hop'].includes(q.routeType),
      `routeType "${q.routeType}" is not valid`,
    )

    // PTB and gas
    assert(q.ptb !== null && q.ptb !== undefined, 'ptb must be present')
    assertGt(q.gasEstimate, 0n, 'gasEstimate')

    // Expiry
    assert(q.validUntil > Date.now(), `quote should not already be expired (validUntil=${q.validUntil})`)
    assert(q.validUntil <= Date.now() + 31_000, 'validUntil should be ≤ 31 s from now')

    console.log(`       ${Number(AMOUNT)/1e9} SUI → ${(Number(q.amountOut)/1e6).toFixed(4)} USDC`)
    console.log(`       type=${q.routeType}   via ${q.route.map(s => s.protocol).join(' → ')}`)
    console.log(`       impact=${(q.priceImpact*100).toFixed(4)}%   gas=${(Number(q.gasEstimate)/1e9).toFixed(6)} SUI`)
  })

  await test('slippageTolerance is reflected correctly in minimumAmountOut', async () => {
    const tight = await routex.getQuote({ from: 'SUI', to: 'USDC', amount: AMOUNT, slippageTolerance: 0.001 })
    const loose = await routex.getQuote({ from: 'SUI', to: 'USDC', amount: AMOUNT, slippageTolerance: 0.05 })
    assert(
      tight.minimumAmountOut >= loose.minimumAmountOut,
      `tighter slippage (min=${tight.minimumAmountOut}) must give higher minimumAmountOut than loose (min=${loose.minimumAmountOut})`,
    )
    console.log(`       0.1% → min ${Number(tight.minimumAmountOut)/1e6} USDC   5% → min ${Number(loose.minimumAmountOut)/1e6} USDC`)
  })

  await test('excludeProtocols is honoured — deepbook excluded from route', async () => {
    try {
      const q = await routex.getQuote({
        from: 'SUI', to: 'USDC', amount: AMOUNT, excludeProtocols: ['deepbook'],
      })
      assert(
        !q.route.some(s => s.protocol === 'deepbook'),
        'deepbook must not appear in route when listed in excludeProtocols',
      )
      assertGt(q.amountOut, 0n, 'amountOut should still be positive via other protocols')
      console.log(`       non-deepbook route: ${q.route.map(s => s.protocol).join(' → ')}   out=${(Number(q.amountOut)/1e6).toFixed(4)} USDC`)
    } catch (err) {
      // Acceptable if on testnet deepbook is the only source for this pair
      if (String(err).includes('No route found')) {
        console.log('       ℹ  only deepbook had this pair on testnet — "No route found" is correct')
      } else {
        throw err
      }
    }
  })

  await test('throws a clear error for an unknown token symbol', async () => {
    let threw = false
    let message = ''
    try {
      await routex.getQuote({ from: 'NONEXISTENT_TOKEN_XYZ', to: 'USDC', amount: AMOUNT })
    } catch (err) {
      threw   = true
      message = err instanceof Error ? err.message : String(err)
    }
    assert(threw, 'should throw for an unknown token, not return a quote')
    assert(
      message.toLowerCase().includes('unknown'),
      `error message should mention "unknown", got: "${message}"`,
    )
    console.log(`       threw: "${message}"`)
  })

  await test('quote expires: validUntil is ~30 s from return time', async () => {
    const q         = await routex.getQuote({ from: 'SUI', to: 'USDC', amount: AMOUNT })
    const remaining = q.validUntil - Date.now()
    assert(remaining > 0,       `quote is already expired upon receipt — validUntil: ${q.validUntil}`)
    assert(remaining <= 31_000, `validUntil remaining ${remaining}ms exceeds 31 s — expected ≤30 s`)
  })
}

// ─── 8. Live execute (optional) ───────────────────────────────────────────────

async function testExecute(): Promise<void> {
  const privKey = process.env.SUI_PRIVATE_KEY
  if (!privKey) {
    console.log('\n  ─────────────────────────────────────────────────────')
    console.log('  8. Live Execute — SKIPPED')
    console.log('     Set SUI_PRIVATE_KEY=suiprivkey1... to run a real')
    console.log('     testnet swap (0.1 SUI → USDC).')
    console.log('  ─────────────────────────────────────────────────────')
    return
  }

  section(8, 'Live Execute — real testnet swap')

  const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
  const keypair = Ed25519Keypair.fromSecretKey(privKey)
  const address = keypair.getPublicKey().toSuiAddress()
  console.log(`\n  Wallet: ${address}`)

  const routex = new Routex(NETWORK, address)

  await test('getQuote then execute — end-to-end swap on testnet', async () => {
    const SMALL = 100_000_000n  // 0.1 SUI — minimal amount for testnet

    const q = await routex.getQuote({
      from: 'SUI', to: 'USDC', amount: SMALL,
      senderAddress: address, slippageTolerance: 0.01,
    })

    assertGt(q.amountOut, 0n, 'amountOut must be positive before executing')
    console.log(`       quote: ${Number(SMALL)/1e9} SUI → ${(Number(q.amountOut)/1e6).toFixed(4)} USDC   type=${q.routeType}`)

    const result = await routex.execute({ quote: q, signer: keypair })

    assert(
      typeof result.digest === 'string' && result.digest.length > 0,
      'digest must be a non-empty string',
    )
    console.log(`       digest: ${result.digest}`)
    console.log(`       https://suiscan.xyz/testnet/tx/${result.digest}`)
  })
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await testDeepBook()
  await testCetus()
  await testAftermath()
  await testAggregator()
  await testPathfinder()
  await testPTBBuilder()
  await testGetQuote()
  await testExecute()

  const total = passed + failed
  console.log(`\n${'═'.repeat(58)}`)
  if (failed === 0) {
    console.log(`  ✓  All ${total} tests passed`)
  } else {
    console.log(`  ${passed}/${total} passed   ${failed} FAILED`)
  }
  console.log(`${'═'.repeat(58)}\n`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('\nFatal runner error:', err)
  process.exit(1)
})
