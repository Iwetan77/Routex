# Routex

Headless swap routing for Sui. Finds the best price across all major liquidity sources and executes atomically via Programmable Transaction Blocks.

```bash
npm install routex-sui
```

---

## Overview

Routex queries every supported liquidity source in parallel, selects the route with the highest net output, and constructs a single atomic PTB ready to sign and submit. If any step in a multi-hop route fails on-chain, the entire transaction reverts.

> **Currently active sources on Sui mainnet with `@mysten/sui@^2`:** DeepBook V3, Aftermath Finance.
> Five other DEX integrations (Cetus, Turbos, 7K, FlowX, Hop) are wired but inactive — their SDKs either pin `@mysten/sui` v1 (BCS schema incompatible with v2) or return non-composable Transaction objects that cannot be chained into our PTB. See [Sui SDK version compatibility](#sui-sdk-version-compatibility) for the full breakdown. Once an upstream SDK ships v2 support, the relevant pool re-activates with no consumer code change.

---

## Quick Start

```typescript
import Routex from 'routex-sui'

// Construct ONCE at app startup and reuse — the first quote on a fresh
// instance is ~5–15s (Aftermath SDK fetches its pool catalog on init);
// subsequent quotes return in ~1–2s.
const routex = new Routex('mainnet')

const quote = await routex.getQuote({
  from: 'SUI',
  to: 'USDC',
  amount: 1_000_000_000n, // 1 SUI in MIST
  slippageTolerance: 0.005, // 0.5%
})

console.log(quote.amountOut)    // expected output in base units
console.log(quote.priceImpact)  // e.g. 0.0049
console.log(quote.routeType)    // 'direct' | 'single-hop' | 'multi-hop'
console.log(quote.route)        // per-step breakdown

// Execute with any Ed25519Keypair or wallet adapter
const result = await routex.execute({ quote, signer: keypair })
console.log(result.digest)      // on-chain transaction digest
```

---

## API

### `new Routex(network, senderAddress?)`

| Parameter | Type | Default |
|---|---|---|
| `network` | `'mainnet' \| 'testnet'` | `'mainnet'` |
| `senderAddress` | `string` | optional |

---

### `routex.getQuote(params)`

Returns a `RoutexQuote` with a pre-built PTB ready to execute.

| Parameter | Type | Default |
|---|---|---|
| `from` | `string` | required — token symbol or full type |
| `to` | `string` | required — token symbol or full type |
| `amount` | `bigint` | required — input amount in base units |
| `slippageTolerance` | `number` | `0.005` (0.5%) |
| `maxHops` | `number` | `3` |
| `excludeProtocols` | `string[]` | `[]` |
| `senderAddress` | `string` | optional |

**Returns: `RoutexQuote`**

```typescript
{
  from: Token
  to: Token
  amountIn: bigint
  amountOut: bigint
  minimumAmountOut: bigint     // after slippage
  route: RouteStep[]           // per-hop breakdown
  routeType: 'direct' | 'single-hop' | 'multi-hop'
  priceImpact: number          // decimal, e.g. 0.0049
  fees: { total: number; breakdown: { protocol: string; fee: number }[] }
  gasEstimate: bigint          // in MIST
  ptb: Transaction             // ready to sign
  validUntil: number           // Unix ms — quote expires after 30s
}
```

---

### `routex.execute(params)`

Executes the pre-built PTB. Throws if the quote has expired.

| Parameter | Type |
|---|---|
| `quote` | `RoutexQuote` |
| `signer` | `Ed25519Keypair` or wallet adapter |

**Returns: `{ digest: string; actualAmountOut: bigint }`**

---

## Supported Protocols

| Protocol | Type | @mysten/sui | Status |
|---|---|---|---|
| DeepBook V3 | Central limit order book | v1 or v2 | ✅ Quote + Build + Execute |
| Aftermath Finance | Multi-asset pools | **v2** | ✅ Quote + Build + Execute |
| 7K Protocol | Meta-aggregator (incl. Bluefin/Cetus/FlowX/OKX internally) | **v1** | ⚠ Auto-disabled on v2 |
| Cetus | Concentrated liquidity AMM | **v1** | ⚠ Auto-disabled (BCS schema mismatch on v2) |
| Turbos Finance | Concentrated liquidity AMM | **v1** | ⚠ Quote only — no PTB builder |
| Hop Aggregator | Meta-aggregator | **v2** | ⚠ Quote only — no PTB builder |
| FlowX Finance | Multi-pool AMM | **v2** | ⚠ Quote only — no PTB builder |

All sources are queried in parallel via `Promise.allSettled`. A failing source never blocks others — Routex always returns the best available quote from a buildable protocol.

### Sui SDK version compatibility

The Sui DEX ecosystem is currently split between two majors of `@mysten/sui`:

- **v1 SDKs**: 7K Protocol, Cetus, Turbos
- **v2 SDKs**: Aftermath, FlowX, Hop

No combination of these SDKs is simultaneously compatible. routex-sui targets `@mysten/sui` **v2** to align with the most actively maintained DEXes (Aftermath, plus DeepBook which works with both). When `@mysten/sui` v2 is resolved in your project, v1-only protocols are detected at module load and disabled automatically — their liquidity is still partially reachable via 7K Protocol's internal aggregation when 7K itself becomes v2-compatible upstream.

To diagnose why a pool returned no quote, enable verbose logging:

```bash
ROUTEX_DEBUG=1 node app.js
```

or programmatically:

```typescript
import { setDebug } from 'routex-sui'
setDebug(true)
```

Every silenced pool error is then logged as:

```
[routex-sui] AftermathPool getQuote(SUI->USDC, 90000000): <underlying error>
```

---

## Architecture

```
getQuote({ from, to, amount })
          │
          ▼
  ┌─────────────────────────────────────────────────┐
  │               Pool Aggregator                   │
  │  DeepBook · Cetus · Aftermath · Turbos · Hop    │
  │  7K Protocol · FlowX                            │
  │  Parallel via Promise.allSettled                │
  │  Fault-tolerant — one source failing            │
  │  never blocks the others                        │
  └─────────────────────────────────────────────────┘
          │
          ▼
  ┌───────────────────────────────┐
  │       Pathfinding Engine      │
  │  Direct:     A → B            │
  │  Single-hop: A → USDC → B     │
  │  Ranked by net output         │
  └───────────────────────────────┘
          │
          ▼
  ┌───────────────────────────────┐
  │        PTB Constructor        │
  │  Chains steps atomically      │
  │  Passes coin outputs as       │
  │  inputs to the next step      │
  │  Dry-runs for gas estimate    │
  └───────────────────────────────┘
          │
          ▼
  execute({ quote, signer })
          │
          ▼
    On-chain settlement
```

---

## Token Reference

Routex resolves tokens by symbol or full Move type.

| Symbol | Network | Type |
|---|---|---|
| `SUI` | both | `0x2::sui::SUI` |
| `USDC` | testnet | `0xf715...::DBUSDC::DBUSDC` |
| `USDC` | mainnet | `0xdba3...::coin::COIN` |
| `DEEP` | both | DeepBook native token |

Pass a full Move type string for any token not in the default registry.

---

## License

MIT
