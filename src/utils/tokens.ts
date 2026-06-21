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

// Mainnet token registry.
// All addresses verified against on-chain CoinMetadata. Symbol keys are the
// common ticker users will type — when the metadata's `symbol` field differs
// (e.g. "haSUI" vs "HASUI") we store the user-typed form. The full Move type
// is what gets sent to the DEX SDKs.
//
// Any token NOT in this list is still routable — pass the full Move type
// string to getQuote() and routex auto-fetches CoinMetadata.
const MAINNET_TOKENS: Record<string, Token> = {
  // ─── Native + bluechip stablecoins ───────────────────────────────────────
  SUI: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    symbol: 'SUI', decimals: 9, name: 'Sui', scalar: 1_000_000_000,
  },
  USDC: {
    address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7',
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    symbol: 'USDC', decimals: 6, name: 'USDC', scalar: 1_000_000,
  },
  USDT: {
    address: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c',
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    symbol: 'USDT', decimals: 6, name: 'Tether USD', scalar: 1_000_000,
  },
  WUSDC: {
    address: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf',
    type: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
    symbol: 'WUSDC', decimals: 6, name: 'USD Coin (Wormhole)', scalar: 1_000_000,
  },
  BUCK: {
    address: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2',
    type: '0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK',
    symbol: 'BUCK', decimals: 9, name: 'Bucket USD', scalar: 1_000_000_000,
  },
  USDY: {
    address: '0x960b531667636f39e85867775f52f6b1f220a058c4de786905bdf761e06a56bb',
    type: '0x960b531667636f39e85867775f52f6b1f220a058c4de786905bdf761e06a56bb::usdy::USDY',
    symbol: 'USDY', decimals: 6, name: 'Ondo US Dollar Yield', scalar: 1_000_000,
  },
  // ─── Wrapped majors ──────────────────────────────────────────────────────
  WETH: {
    address: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5',
    type: '0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN',
    symbol: 'WETH', decimals: 8, name: 'Wrapped Ether', scalar: 100_000_000,
  },
  WBTC: {
    address: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881',
    type: '0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN',
    symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC', scalar: 100_000_000,
  },
  SOL: {
    address: '0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8',
    type: '0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN',
    symbol: 'SOL', decimals: 8, name: 'Wrapped SOL', scalar: 100_000_000,
  },
  // ─── DeFi / infrastructure tokens ────────────────────────────────────────
  DEEP: {
    address: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270',
    type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    symbol: 'DEEP', decimals: 6, name: 'DeepBook Token', scalar: 1_000_000,
  },
  CETUS: {
    address: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b',
    type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS',
    symbol: 'CETUS', decimals: 9, name: 'Cetus Token', scalar: 1_000_000_000,
  },
  TURBOS: {
    address: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a',
    type: '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS',
    symbol: 'TURBOS', decimals: 9, name: 'Turbos', scalar: 1_000_000_000,
  },
  FLX: {
    address: '0x6dae8ca14311574fdfe555524ea48558e3d1360d1607d1c7f98af867e3b7976c',
    type: '0x6dae8ca14311574fdfe555524ea48558e3d1360d1607d1c7f98af867e3b7976c::flx::FLX',
    symbol: 'FLX', decimals: 8, name: 'FlowX', scalar: 100_000_000,
  },
  SCA: {
    address: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6',
    type: '0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA',
    symbol: 'SCA', decimals: 9, name: 'Scallop', scalar: 1_000_000_000,
  },
  NAVX: {
    address: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5',
    type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX',
    symbol: 'NAVX', decimals: 9, name: 'NAVX Token', scalar: 1_000_000_000,
  },
  BLUE: {
    address: '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca',
    type: '0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE',
    symbol: 'BLUE', decimals: 9, name: 'Bluefin', scalar: 1_000_000_000,
  },
  SUIP: {
    address: '0xe4239cd951f6c53d9c41e25270d80d31f925ad1655e5ba5b543843d4a66975ee',
    type: '0xe4239cd951f6c53d9c41e25270d80d31f925ad1655e5ba5b543843d4a66975ee::SUIP::SUIP',
    symbol: 'SUIP', decimals: 9, name: 'SuiPad', scalar: 1_000_000_000,
  },
  // ─── Liquid staking SUI variants ─────────────────────────────────────────
  HASUI: {
    address: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d',
    type: '0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI',
    symbol: 'HASUI', decimals: 9, name: 'Haedal Staked SUI', scalar: 1_000_000_000,
  },
  AFSUI: {
    address: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc',
    type: '0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI',
    symbol: 'AFSUI', decimals: 9, name: 'Aftermath Staked SUI', scalar: 1_000_000_000,
  },
  VSUI: {
    address: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55',
    type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT',
    symbol: 'VSUI', decimals: 9, name: 'Volo Staked SUI', scalar: 1_000_000_000,
  },
  STSUI: {
    address: '0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55',
    type: '0xd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI',
    symbol: 'STSUI', decimals: 9, name: 'AlphaFi Staked SUI', scalar: 1_000_000_000,
  },
  // ─── Walrus + ecosystem ──────────────────────────────────────────────────
  WAL: {
    address: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59',
    type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    symbol: 'WAL', decimals: 9, name: 'Walrus', scalar: 1_000_000_000,
  },
  NS: {
    address: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178',
    type: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS',
    symbol: 'NS', decimals: 6, name: 'SuiNS Token', scalar: 1_000_000,
  },
  SEND: {
    address: '0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7',
    type: '0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND',
    symbol: 'SEND', decimals: 6, name: 'Suilend', scalar: 1_000_000,
  },
  // ─── Popular memes (verified canonical addresses) ────────────────────────
  FUD: {
    address: '0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1',
    type: '0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD',
    symbol: 'FUD', decimals: 5, name: 'FUD', scalar: 100_000,
  },
  LOFI: {
    address: '0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503',
    type: '0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI',
    symbol: 'LOFI', decimals: 9, name: 'LOFI', scalar: 1_000_000_000,
  },
  HIPPO: {
    address: '0x8993129d72e733985f7f1a00396cbd055bad6f817fee36576ce483c8bbb8b87b',
    type: '0x8993129d72e733985f7f1a00396cbd055bad6f817fee36576ce483c8bbb8b87b::sudeng::SUDENG',
    symbol: 'HIPPO', decimals: 9, name: 'sudeng', scalar: 1_000_000_000,
  },
  BLUB: {
    address: '0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0',
    type: '0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB',
    symbol: 'BLUB', decimals: 2, name: 'BLUB', scalar: 100,
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
      client: new SuiClient({ url: getFullnodeUrl(activeNetwork), network: activeNetwork }),
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
