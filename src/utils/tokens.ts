import { normalizeStructTag } from '@mysten/sui/utils'
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc'
import type { Token } from '../types.js'
import { debugWarn } from './debug.js'

/**
 * Normalize a Sui struct/coin type string so that `0x2::sui::SUI` and
 * `0x0000…0002::sui::SUI` compare equal. Wraps `normalizeStructTag` from
 * `@mysten/sui/utils` with a safe fallback when given malformed input.
 */
export function normalizeCoinType(type: string): string {
  try {
    return normalizeStructTag(type)
  } catch {
    return type
  }
}

/** True if two Sui coin/struct type strings refer to the same type, regardless of address short/long form. */
export function coinTypesEqual(a: string, b: string): boolean {
  return normalizeCoinType(a) === normalizeCoinType(b)
}

// Testnet token registry (DeepBook V3 testnet coins)
const TESTNET_TOKENS: Record<string, Token> = {
  SUI: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    symbol: 'SUI',
    decimals: 9,
    name: 'Sui',
    scalar: 1_000_000_000,
  },
  USDC: {
    // On testnet, USDC is represented as DBUSDC from DeepBook
    address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin (testnet)',
    scalar: 1_000_000,
  },
  DBUSDC: {
    address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    symbol: 'DBUSDC',
    decimals: 6,
    name: 'DeepBook USD Coin',
    scalar: 1_000_000,
  },
  DEEP: {
    address: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8',
    type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    symbol: 'DEEP',
    decimals: 6,
    name: 'DeepBook Token',
    scalar: 1_000_000,
  },
  WBTC: {
    address: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86',
    type: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC',
    symbol: 'WBTC',
    decimals: 8,
    name: 'Wrapped BTC (testnet)',
    scalar: 100_000_000,
  },
}

// Mainnet token registry
const MAINNET_TOKENS: Record<string, Token> = {
  SUI: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    symbol: 'SUI',
    decimals: 9,
    name: 'Sui',
    scalar: 1_000_000_000,
  },
  USDC: {
    address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7',
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin',
    scalar: 1_000_000,
  },
  USDT: {
    address: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c',
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD',
    scalar: 1_000_000,
  },
  DEEP: {
    address: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270',
    type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    symbol: 'DEEP',
    decimals: 6,
    name: 'DeepBook Token',
    scalar: 1_000_000,
  },
  WETH: {
    address: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5',
    type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
    symbol: 'WETH',
    decimals: 8,
    name: 'Wrapped Ether',
    scalar: 100_000_000,
  },
  // ─── Tokens with coverage on Turbos / FlowX / Hop / 7K ──────────────────
  WBTC: {
    address: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881',
    type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    symbol: 'WBTC',
    decimals: 8,
    name: 'Wrapped BTC',
    scalar: 100_000_000,
  },
  BUCK: {
    address: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2',
    type: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK',
    symbol: 'BUCK',
    decimals: 9,
    name: 'Bucket USD',
    scalar: 1_000_000_000,
  },
  AUSD: {
    address: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14129c58',
    type: '0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14129c58::ausd::AUSD',
    symbol: 'AUSD',
    decimals: 6,
    name: 'Aurus USD',
    scalar: 1_000_000,
  },
  NAVX: {
    address: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5',
    type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
    symbol: 'NAVX',
    decimals: 9,
    name: 'NAVI Token',
    scalar: 1_000_000_000,
  },
  HASUI: {
    address: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d',
    type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
    symbol: 'HASUI',
    decimals: 9,
    name: 'Haedal Staked SUI',
    scalar: 1_000_000_000,
  },
  AFSUI: {
    address: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc',
    type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
    symbol: 'AFSUI',
    decimals: 9,
    name: 'Aftermath Finance Staked SUI',
    scalar: 1_000_000_000,
  },
}

let tokenRegistry = TESTNET_TOKENS
let activeNetwork: 'mainnet' | 'testnet' = 'testnet'

export function setNetwork(network: 'mainnet' | 'testnet') {
  activeNetwork = network
  tokenRegistry = network === 'mainnet' ? MAINNET_TOKENS : TESTNET_TOKENS
}

// ─── Dynamic token resolution via on-chain metadata ─────────────────────────
//
// The hardcoded registry only covers a dozen well-known symbols. To unlock
// every coin type on Sui — WAL, memecoins, RWA tokens, anything — we fetch
// CoinMetadata directly from the chain when the user passes a full Move type
// string we don't have cached.

/** A struct type looks like `0x<addr>::<module>::<Name>`. */
function looksLikeStructType(s: string): boolean {
  return s.startsWith('0x') && s.split('::').length === 3
}

// Cache: normalized type string -> Token. Lives for the process lifetime —
// CoinMetadata is immutable per coin so this never goes stale.
const onChainTokenCache = new Map<string, Token>()

// Lazy per-network SuiClient just for metadata fetches.
let metadataClient: { client: SuiClient; network: 'mainnet' | 'testnet' } | null = null
function getMetadataClient(): SuiClient {
  if (!metadataClient || metadataClient.network !== activeNetwork) {
    metadataClient = {
      client: new SuiClient({ url: getFullnodeUrl(activeNetwork) }),
      network: activeNetwork,
    }
  }
  return metadataClient.client
}

/**
 * Resolve any coin type to a Token, fetching CoinMetadata on chain when needed.
 *
 * Accepts:
 *   - A registry symbol  (e.g. 'SUI', 'USDC', 'DEEP')
 *   - A full Move type   (e.g. '0x356a...::wal::WAL' for Walrus token, any memecoin, etc.)
 *
 * This is the async path used by `Routex.getQuote` — it gives users access to
 * every token DeepBook or Aftermath actually routes, not just the 11 in the
 * hardcoded registry.
 */
export async function resolveTokenAsync(symbolOrType: string): Promise<Token> {
  // 1. Sync registry hit — fastest path, no RPC.
  const sync = tryResolveSync(symbolOrType)
  if (sync) return sync

  // 2. Looks like a Move type? Fetch CoinMetadata from chain.
  if (looksLikeStructType(symbolOrType)) {
    const normalized = normalizeCoinType(symbolOrType)
    const cached = onChainTokenCache.get(normalized)
    if (cached) return cached

    try {
      const meta = await getMetadataClient().getCoinMetadata({ coinType: normalized })
      if (!meta) {
        throw new Error(
          `Coin type "${symbolOrType}" has no on-chain CoinMetadata. ` +
          `The type may not exist or its CoinMetadata object was not published.`,
        )
      }
      const decimals = meta.decimals
      const token: Token = {
        address: normalized.split('::')[0],
        type: normalized,
        symbol: meta.symbol,
        decimals,
        name: meta.name || meta.symbol,
        scalar: 10 ** decimals,
      }
      onChainTokenCache.set(normalized, token)
      return token
    } catch (err) {
      debugWarn('resolveTokenAsync', `getCoinMetadata(${normalized}) failed`, err)
      throw new Error(
        `Failed to fetch CoinMetadata for "${symbolOrType}": ` +
        (err instanceof Error ? err.message : String(err)),
      )
    }
  }

  throw new Error(
    `Unknown token: "${symbolOrType}". ` +
    `Pass a registry symbol (${Object.keys(tokenRegistry).join(', ')}) ` +
    `or a full Move type like 0x356a...::wal::WAL.`,
  )
}

/** Sync resolution against the hardcoded registry only. Returns null for unknowns. */
function tryResolveSync(symbolOrType: string): Token | null {
  const upper = symbolOrType.toUpperCase()
  if (tokenRegistry[upper]) return tokenRegistry[upper]
  for (const token of Object.values(tokenRegistry)) {
    if (token.type === symbolOrType
        || token.address === symbolOrType
        || coinTypesEqual(token.type, symbolOrType)) {
      return token
    }
  }
  return null
}

/**
 * Synchronous resolution. Backwards-compatible: throws for any token not in the
 * hardcoded registry. New code should prefer `resolveTokenAsync` for full
 * Sui-wide coverage.
 */
export function resolveToken(symbolOrType: string): Token {
  const found = tryResolveSync(symbolOrType)
  if (found) return found
  throw new Error(
    `Unknown token: ${symbolOrType}. ` +
    `Supported registry symbols: ${Object.keys(tokenRegistry).join(', ')}. ` +
    `For arbitrary Sui coin types pass the full Move type to getQuote() — ` +
    `routex resolves on-chain CoinMetadata automatically.`,
  )
}

export function getTokenBySymbol(symbol: string): Token | null {
  return tokenRegistry[symbol.toUpperCase()] ?? null
}

export function toBaseUnits(amount: number, token: Token): bigint {
  return BigInt(Math.round(amount * token.scalar))
}

export function fromBaseUnits(amount: bigint, token: Token): number {
  return Number(amount) / token.scalar
}
