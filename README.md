# Routex

Headless swap routing for Sui. Finds the best price across all major liquidity sources and executes atomically via Programmable Transaction Blocks.

```bash
npm install @routex/sui
```

---

## Overview

Routex queries **DeepBook V3**, **Cetus**, and **Aftermath Finance** simultaneously, selects the route with the highest net output, and constructs a single atomic PTB ready to sign and submit. If any step in a multi-hop route fails on-chain, the entire transaction reverts.

---

## Quick Start

```typescript
import Routex from '@routex/sui'

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

| Protocol | Type | Network |
|---|---|---|
| DeepBook V3 | Central limit order book | Mainnet + Testnet |
| Cetus | Concentrated liquidity AMM | Mainnet |
| Aftermath Finance | Multi-asset pools | Mainnet |

---

## Architecture

```
getQuote({ from, to, amount })
          │
          ▼
  ┌───────────────────────────────┐
  │        Pool Aggregator        │
  │  DeepBook · Cetus · Aftermath │
  │  Parallel via Promise.allSettled
  │  Fault-tolerant — one source  │
  │  failing never blocks others  │
  └───────────────────────────────┘
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
