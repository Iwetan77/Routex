import type { Token } from '../types.js'

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
}

let tokenRegistry = TESTNET_TOKENS

export function setNetwork(network: 'mainnet' | 'testnet') {
  tokenRegistry = network === 'mainnet' ? MAINNET_TOKENS : TESTNET_TOKENS
}

export function resolveToken(symbolOrType: string): Token {
  // Direct symbol lookup (case-insensitive)
  const upper = symbolOrType.toUpperCase()
  if (tokenRegistry[upper]) return tokenRegistry[upper]

  // Search by full type string
  for (const token of Object.values(tokenRegistry)) {
    if (token.type === symbolOrType || token.address === symbolOrType) return token
  }

  throw new Error(`Unknown token: ${symbolOrType}. Supported: ${Object.keys(tokenRegistry).join(', ')}`)
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
