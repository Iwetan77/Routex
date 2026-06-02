// src/pools/deepbook.ts
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from "@mysten/sui/jsonRpc";
import { DeepBookClient } from "@mysten/deepbook-v3";
import { testnetCoins, testnetPools, mainnetCoins, mainnetPools } from "@mysten/deepbook-v3";

// src/utils/tokens.ts
import { normalizeStructTag } from "@mysten/sui/utils";
function normalizeCoinType(type) {
  try {
    return normalizeStructTag(type);
  } catch {
    return type;
  }
}
function coinTypesEqual(a, b) {
  return normalizeCoinType(a) === normalizeCoinType(b);
}
var TESTNET_TOKENS = {
  SUI: {
    address: "0x0000000000000000000000000000000000000000000000000000000000000002",
    type: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    symbol: "SUI",
    decimals: 9,
    name: "Sui",
    scalar: 1e9
  },
  USDC: {
    // On testnet, USDC is represented as DBUSDC from DeepBook
    address: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7",
    type: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin (testnet)",
    scalar: 1e6
  },
  DBUSDC: {
    address: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7",
    type: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    symbol: "DBUSDC",
    decimals: 6,
    name: "DeepBook USD Coin",
    scalar: 1e6
  },
  DEEP: {
    address: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8",
    type: "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP",
    symbol: "DEEP",
    decimals: 6,
    name: "DeepBook Token",
    scalar: 1e6
  },
  WBTC: {
    address: "0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86",
    type: "0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC",
    symbol: "WBTC",
    decimals: 8,
    name: "Wrapped BTC (testnet)",
    scalar: 1e8
  }
};
var MAINNET_TOKENS = {
  SUI: {
    address: "0x0000000000000000000000000000000000000000000000000000000000000002",
    type: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    symbol: "SUI",
    decimals: 9,
    name: "Sui",
    scalar: 1e9
  },
  USDC: {
    address: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7",
    type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
    scalar: 1e6
  },
  USDT: {
    address: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c",
    type: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD",
    scalar: 1e6
  },
  DEEP: {
    address: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270",
    type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    symbol: "DEEP",
    decimals: 6,
    name: "DeepBook Token",
    scalar: 1e6
  },
  WETH: {
    address: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5",
    type: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
    symbol: "WETH",
    decimals: 8,
    name: "Wrapped Ether",
    scalar: 1e8
  },
  // ─── Tokens with coverage on Turbos / FlowX / Hop / 7K ──────────────────
  WBTC: {
    address: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881",
    type: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
    symbol: "WBTC",
    decimals: 8,
    name: "Wrapped BTC",
    scalar: 1e8
  },
  BUCK: {
    address: "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2",
    type: "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8efdc3f4eb123e0ca37b184db2::buck::BUCK",
    symbol: "BUCK",
    decimals: 9,
    name: "Bucket USD",
    scalar: 1e9
  },
  AUSD: {
    address: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14129c58",
    type: "0x2053d08c1e2bd02791056171aab0fd12bd7cd7efad2ab8f6b9c8902f14129c58::ausd::AUSD",
    symbol: "AUSD",
    decimals: 6,
    name: "Aurus USD",
    scalar: 1e6
  },
  NAVX: {
    address: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5",
    type: "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
    symbol: "NAVX",
    decimals: 9,
    name: "NAVI Token",
    scalar: 1e9
  },
  HASUI: {
    address: "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d",
    type: "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI",
    symbol: "HASUI",
    decimals: 9,
    name: "Haedal Staked SUI",
    scalar: 1e9
  },
  AFSUI: {
    address: "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc",
    type: "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI",
    symbol: "AFSUI",
    decimals: 9,
    name: "Aftermath Finance Staked SUI",
    scalar: 1e9
  }
};
var tokenRegistry = TESTNET_TOKENS;
function setNetwork(network) {
  tokenRegistry = network === "mainnet" ? MAINNET_TOKENS : TESTNET_TOKENS;
}
function resolveToken(symbolOrType) {
  const upper = symbolOrType.toUpperCase();
  if (tokenRegistry[upper]) return tokenRegistry[upper];
  for (const token of Object.values(tokenRegistry)) {
    if (token.type === symbolOrType || token.address === symbolOrType) return token;
  }
  throw new Error(`Unknown token: ${symbolOrType}. Supported: ${Object.keys(tokenRegistry).join(", ")}`);
}
function getTokenBySymbol(symbol) {
  return tokenRegistry[symbol.toUpperCase()] ?? null;
}
function fromBaseUnits(amount, token) {
  return Number(amount) / token.scalar;
}

// src/pools/deepbook.ts
var SIMULATION_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000001";
var TESTNET_SYMBOL_MAP = {
  SUI: "SUI",
  USDC: "DBUSDC",
  DBUSDC: "DBUSDC",
  DEEP: "DEEP",
  WBTC: "DBTC"
};
var MAINNET_SYMBOL_MAP = {
  SUI: "SUI",
  USDC: "USDC",
  DEEP: "DEEP",
  WETH: "WETH",
  USDT: "USDT"
};
var TESTNET_POOL_KEYS = {
  "SUI_DBUSDC": "SUI_DBUSDC",
  "DBUSDC_SUI": "SUI_DBUSDC",
  "SUI_USDC": "SUI_DBUSDC",
  "USDC_SUI": "SUI_DBUSDC",
  "DEEP_SUI": "DEEP_SUI",
  "SUI_DEEP": "DEEP_SUI",
  "DEEP_DBUSDC": "DEEP_DBUSDC",
  "DBUSDC_DEEP": "DEEP_DBUSDC"
};
var MAINNET_POOL_KEYS = {
  "SUI_USDC": "SUI_USDC",
  "USDC_SUI": "SUI_USDC",
  "DEEP_USDC": "DEEP_USDC",
  "USDC_DEEP": "DEEP_USDC",
  "DEEP_SUI": "DEEP_SUI",
  "SUI_DEEP": "DEEP_SUI"
};
var DeepBookPool = class {
  client;
  suiClient;
  network;
  symbolMap;
  poolKeyMap;
  constructor(network = "testnet", address) {
    this.network = network;
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) });
    this.symbolMap = network === "testnet" ? TESTNET_SYMBOL_MAP : MAINNET_SYMBOL_MAP;
    this.poolKeyMap = network === "testnet" ? TESTNET_POOL_KEYS : MAINNET_POOL_KEYS;
    const coins = network === "testnet" ? testnetCoins : mainnetCoins;
    const pools = network === "testnet" ? testnetPools : mainnetPools;
    this.client = new DeepBookClient({
      client: this.suiClient,
      network,
      address: address ?? SIMULATION_ADDRESS,
      coins,
      pools
    });
  }
  getDeepBookSymbol(token) {
    return this.symbolMap[token.symbol.toUpperCase()] ?? null;
  }
  getPoolKey(tokenIn, tokenOut) {
    const symIn = this.getDeepBookSymbol(tokenIn);
    const symOut = this.getDeepBookSymbol(tokenOut);
    if (!symIn || !symOut) return null;
    const key = `${symIn}_${symOut}`;
    return this.poolKeyMap[key] ?? null;
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const poolKey = this.getPoolKey(tokenIn, tokenOut);
      if (!poolKey) return null;
      const pool = this.network === "testnet" ? testnetPools[poolKey] : mainnetPools[poolKey];
      if (!pool) return null;
      const dbSymIn = this.getDeepBookSymbol(tokenIn);
      const isBaseToCoin = pool.baseCoin === dbSymIn;
      const amountInHuman = fromBaseUnits(amountIn, tokenIn);
      let amountOutHuman;
      let midPrice;
      if (isBaseToCoin) {
        const result = await this.client.getQuoteQuantityOut(poolKey, amountInHuman);
        if (result.quoteOut === 0) return null;
        amountOutHuman = result.quoteOut;
        midPrice = await this.client.midPrice(poolKey).catch(() => 0);
      } else {
        const result = await this.client.getBaseQuantityOut(poolKey, amountInHuman);
        if (result.baseOut === 0) return null;
        amountOutHuman = result.baseOut;
        const mid = await this.client.midPrice(poolKey).catch(() => 0);
        midPrice = mid > 0 ? 1 / mid : 0;
      }
      const amountOut = BigInt(Math.floor(amountOutHuman * tokenOut.scalar));
      if (amountOut === 0n) return null;
      const executedRate = amountOutHuman / amountInHuman;
      const priceImpact = midPrice > 0 ? Math.max(0, (midPrice - executedRate) / midPrice) : 0;
      const tradeParams = await this.client.poolTradeParams(poolKey).catch(() => ({ takerFee: 1e-3 }));
      return {
        protocol: "deepbook",
        poolId: poolKey,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: tradeParams.takerFee,
        priceImpact
      };
    } catch {
      return null;
    }
  }
  // Returns the DeepBook client for PTB construction
  getDeepBookClient() {
    return this.client;
  }
  getPoolKeyForPair(tokenIn, tokenOut) {
    return this.getPoolKey(tokenIn, tokenOut);
  }
  isBaseCoin(poolKey, tokenIn) {
    const dbSym = this.getDeepBookSymbol(tokenIn);
    const pool = this.network === "testnet" ? testnetPools[poolKey] : mainnetPools[poolKey];
    return pool?.baseCoin === dbSym;
  }
};

// src/pools/cetus.ts
import { initCetusSDK } from "@cetusprotocol/cetus-sui-clmm-sdk";
var KNOWN_MAINNET_POOLS = [
  // SUI/USDC — verified high-liquidity pool (TVL ~$15M+).
  "0xb8d7d9e66a60c239e7a60110efcf8de6c705580ed924d0dde141f4a0e2c90105"
];
var CetusPool = class {
  constructor(network, senderAddress) {
    this.network = network;
    this.sdk = initCetusSDK({
      network,
      wallet: senderAddress ?? "0x0000000000000000000000000000000000000000000000000000000000000001"
    });
    this.knownPoolIds = network === "mainnet" ? [...KNOWN_MAINNET_POOLS] : [];
  }
  network;
  sdk;
  poolCache = /* @__PURE__ */ new Map();
  cacheExpiry = /* @__PURE__ */ new Map();
  CACHE_TTL = 3e4;
  // 30 seconds
  knownPoolIds;
  /** Cache the resolved Pool object for each known pool ID so we don't re-fetch every time. */
  knownPoolObjects = /* @__PURE__ */ new Map();
  updateSender(address) {
    this.sdk.senderAddress = address;
  }
  /** Add a known Cetus pool ID for on-chain fallback discovery. */
  registerKnownPool(poolId) {
    if (!this.knownPoolIds.includes(poolId)) this.knownPoolIds.push(poolId);
  }
  cacheKey(typeA, typeB) {
    return [normalizeCoinType(typeA), normalizeCoinType(typeB)].sort().join("|");
  }
  /** Fetch a known pool object once, cache it for the lifetime of the CetusPool instance. */
  async getKnownPool(poolId) {
    if (this.knownPoolObjects.has(poolId)) return this.knownPoolObjects.get(poolId);
    try {
      const pool = await Promise.race([
        this.sdk.Pool.getPool(poolId, true),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Cetus getPool timeout")), 4e3)
        )
      ]);
      if (pool) this.knownPoolObjects.set(poolId, pool);
      return pool ?? null;
    } catch {
      return null;
    }
  }
  async getPoolsForPair(tokenIn, tokenOut) {
    const key = this.cacheKey(tokenIn.type, tokenOut.type);
    const expiry = this.cacheExpiry.get(key) ?? 0;
    if (Date.now() < expiry && this.poolCache.has(key)) {
      return this.poolCache.get(key);
    }
    let pools = [];
    try {
      pools = await Promise.race([
        this.sdk.Pool.getPoolByCoins([tokenIn.type, tokenOut.type]),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Cetus pool fetch timeout")), 4e3)
        )
      ]);
    } catch {
      pools = [];
    }
    if (pools.length === 0 && this.knownPoolIds.length > 0) {
      const candidates = await Promise.all(
        this.knownPoolIds.map((id) => this.getKnownPool(id))
      );
      pools = candidates.filter((p) => p !== null).filter(
        (p) => coinTypesEqual(p.coinTypeA, tokenIn.type) && coinTypesEqual(p.coinTypeB, tokenOut.type) || coinTypesEqual(p.coinTypeA, tokenOut.type) && coinTypesEqual(p.coinTypeB, tokenIn.type)
      );
    }
    const active = pools.filter((p) => !p.is_pause && p.liquidity > 0);
    this.poolCache.set(key, active);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
    return active;
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const pools = await this.getPoolsForPair(tokenIn, tokenOut);
      if (pools.length === 0) return null;
      const sorted = [...pools].sort((a, b) => b.liquidity - a.liquidity);
      let bestStep = null;
      for (const pool of sorted.slice(0, 3)) {
        const step = await this.quoteFromPool(pool, tokenIn, tokenOut, amountIn);
        if (step && (!bestStep || step.amountOut > bestStep.amountOut)) {
          bestStep = step;
        }
      }
      return bestStep;
    } catch {
      return null;
    }
  }
  async quoteFromPool(pool, tokenIn, tokenOut, amountIn) {
    try {
      const a2b = coinTypesEqual(pool.coinTypeA, tokenIn.type);
      const decimalsA = a2b ? tokenIn.decimals : tokenOut.decimals;
      const decimalsB = a2b ? tokenOut.decimals : tokenIn.decimals;
      const result = await this.sdk.Swap.preswap({
        pool,
        currentSqrtPrice: pool.current_sqrt_price,
        decimalsA,
        decimalsB,
        a2b,
        byAmountIn: true,
        amount: amountIn.toString()
      });
      if (!result || result.isExceed) return null;
      const amountOut = BigInt(result.estimatedAmountOut);
      if (amountOut === 0n) return null;
      const amountInHuman = fromBaseUnits(amountIn, tokenIn);
      const amountOutHuman = fromBaseUnits(amountOut, tokenOut);
      const sqrtPriceCurrent = Number(pool.current_sqrt_price);
      const sqrtPriceAfter = Number(result.estimatedEndSqrtPrice ?? pool.current_sqrt_price);
      const sqrtRatio = sqrtPriceCurrent > 0 ? sqrtPriceAfter / sqrtPriceCurrent : 1;
      const priceImpact = Math.min(1, Math.max(0, 1 - sqrtRatio * sqrtRatio));
      return {
        protocol: "cetus",
        poolId: pool.poolAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: pool.fee_rate / 1e6,
        priceImpact: Math.min(priceImpact, 1)
      };
    } catch {
      return null;
    }
  }
  getSdk() {
    return this.sdk;
  }
  /**
   * Fetch a Cetus pool object directly from chain by ID. Used by the PTB
   * builder to read the authoritative `coinTypeA`/`coinTypeB` ordering
   * (which determines the `a2b` swap direction). Cached for the lifetime
   * of this CetusPool instance.
   */
  async getPool(poolId) {
    return this.getKnownPool(poolId);
  }
  async getPoolForPair(tokenIn, tokenOut) {
    const pools = await this.getPoolsForPair(tokenIn, tokenOut);
    if (pools.length === 0) return null;
    return pools.sort((a, b) => b.liquidity - a.liquidity)[0];
  }
};

// src/pools/aftermath.ts
import { Aftermath } from "aftermath-ts-sdk";
var NETWORK_MAP = {
  mainnet: "MAINNET",
  testnet: "TESTNET"
};
var AftermathPool = class {
  constructor(network) {
    this.network = network;
    this.sdk = new Aftermath(NETWORK_MAP[network]);
  }
  network;
  sdk;
  router = null;
  initPromise = null;
  // Route cache: keyed by `${coinInType}_${coinOutType}_${amountIn}`
  // Expiry matches the 30 s quote TTL so the cached route is always valid for the PTB build
  routeCache = /* @__PURE__ */ new Map();
  CACHE_TTL = 3e4;
  // ─── Lazy initialisation ──────────────────────────────────────────────────
  ensureInit() {
    if (this.router !== null) return Promise.resolve();
    if (this.initPromise) return this.initPromise;
    this.initPromise = Promise.race([
      this.sdk.init(),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Aftermath init timeout")), 5e3)
      )
    ]).then(() => {
      this.router = this.sdk.Router();
    }).catch((err) => {
      this.initPromise = null;
      throw err;
    });
    return this.initPromise;
  }
  // ─── Quote ───────────────────────────────────────────────────────────────
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      await this.ensureInit();
      const router = this.router;
      const refAmountIn = amountIn / 1000n > 0n ? amountIn / 1000n : 1n;
      const withDeadline = (p) => Promise.race([
        p,
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Aftermath router timeout")), 5e3)
        )
      ]);
      const [mainResult, refResult] = await Promise.allSettled([
        withDeadline(router.getCompleteTradeRouteGivenAmountIn({
          coinInType: tokenIn.type,
          coinOutType: tokenOut.type,
          coinInAmount: amountIn
        })),
        withDeadline(router.getCompleteTradeRouteGivenAmountIn({
          coinInType: tokenIn.type,
          coinOutType: tokenOut.type,
          coinInAmount: refAmountIn
        }))
      ]);
      if (mainResult.status === "rejected") return null;
      const route = mainResult.value;
      const amountOut = BigInt(route.coinOut.amount);
      if (amountOut === 0n) return null;
      const key = this.cacheKey(tokenIn, tokenOut, amountIn);
      this.routeCache.set(key, { route, expiry: Date.now() + this.CACHE_TTL });
      const rawExecutedRate = Number(amountOut) / Number(amountIn);
      let priceImpact = 0;
      if (route.spotPrice > 0) {
        const rawSpotRate = 1 / route.spotPrice;
        priceImpact = Math.max(0, (rawSpotRate - rawExecutedRate) / rawSpotRate);
      } else if (refResult.status === "fulfilled") {
        const refOut = Number(refResult.value.coinOut.amount);
        const refIn = Number(refAmountIn);
        if (refOut > 0 && refIn > 0) {
          const rawRefRate = refOut / refIn;
          priceImpact = rawRefRate > 0 ? Math.max(0, 1 - rawExecutedRate / rawRefRate) : 0;
        }
      }
      return {
        protocol: "aftermath",
        // Synthetic poolId — Aftermath routes across multiple pools internally;
        // we store the pair identity so the builder can look up the cached route.
        poolId: `aftermath:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        // netTradeFeePercentage is expressed as a decimal (0.003 = 0.3 %)
        fee: route.netTradeFeePercentage,
        priceImpact
      };
    } catch {
      return null;
    }
  }
  // ─── Route cache access (for PTB builder) ─────────────────────────────────
  getCachedRoute(tokenIn, tokenOut, amountIn) {
    const entry = this.routeCache.get(this.cacheKey(tokenIn, tokenOut, amountIn));
    if (!entry || Date.now() > entry.expiry) return null;
    return entry.route;
  }
  // ─── PTB construction ─────────────────────────────────────────────────────
  /**
   * Appends the Aftermath swap instructions to an existing Transaction.
   * Returns the `coinOutId` argument so it can be chained in a multi-hop PTB.
   * If `coinInId` is provided (intermediate multi-hop coin), Aftermath uses it
   * as the input rather than fetching coins from the wallet.
   */
  async addSwapToTransaction(tx, route, slippage, walletAddress, coinInId) {
    await this.ensureInit();
    const router = this.router;
    const { tx: updatedTx, coinOutId } = await router.addTransactionForCompleteTradeRoute({
      tx,
      completeRoute: route,
      slippage,
      walletAddress,
      ...coinInId !== void 0 ? { coinInId } : {}
    });
    return { tx: updatedTx, coinOutId };
  }
  // ─── Helpers ──────────────────────────────────────────────────────────────
  cacheKey(tokenIn, tokenOut, amountIn) {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`;
  }
};

// src/pools/turbos.ts
import { TurbosSdk, Network } from "turbos-clmm-sdk";
var TurbosPool = class {
  // 60 seconds
  constructor(network) {
    this.network = network;
    this.sdk = new TurbosSdk(
      network === "mainnet" ? Network.mainnet : Network.testnet
    );
  }
  network;
  sdk;
  // Pool cache: key = `${coinTypeA}|${coinTypeB}`, value = array of pool IDs
  poolCache = /* @__PURE__ */ new Map();
  cacheExpiry = /* @__PURE__ */ new Map();
  CACHE_TTL = 6e4;
  cacheKey(typeA, typeB) {
    return [typeA, typeB].sort().join("|");
  }
  /**
   * Find Turbos pools that contain both coinTypes by scanning all pools and
   * filtering by the pool's type arguments.  We cache the matching pool IDs
   * to avoid repeated full-scan RPC calls.
   */
  async getPoolsForPair(tokenIn, tokenOut) {
    const key = this.cacheKey(tokenIn.type, tokenOut.type);
    if ((this.cacheExpiry.get(key) ?? 0) > Date.now()) {
      return this.poolCache.get(key) ?? [];
    }
    try {
      const allPools = await Promise.race([
        this.sdk.pool.getPools(),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Turbos getPools timeout")), 4e3)
        )
      ]);
      const matching = allPools.filter((p) => {
        const types = p.types ?? [];
        return types.includes(tokenIn.type) && types.includes(tokenOut.type);
      });
      this.poolCache.set(key, matching);
      this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
      return matching;
    } catch {
      return [];
    }
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const pools = await this.getPoolsForPair(tokenIn, tokenOut);
      if (pools.length === 0) return null;
      const a2b = tokenIn.type < tokenOut.type;
      let bestStep = null;
      for (const pool of pools.slice(0, 3)) {
        const poolId = pool.objectId;
        const step = await this.quoteFromPool(poolId, a2b, tokenIn, tokenOut, amountIn);
        if (step && (!bestStep || step.amountOut > bestStep.amountOut)) {
          bestStep = step;
        }
      }
      return bestStep;
    } catch {
      return null;
    }
  }
  async quoteFromPool(poolId, a2b, tokenIn, tokenOut, amountIn) {
    try {
      const [result] = await this.sdk.trade.computeSwapResultV2({
        pools: [{ pool: poolId, a2b, amountSpecified: amountIn.toString() }],
        address: "0x0000000000000000000000000000000000000000000000000000000000000001",
        amountSpecifiedIsInput: true
      });
      if (!result) return null;
      const rawOut = a2b ? result.amount_b : result.amount_a;
      if (!rawOut) return null;
      const amountOut = BigInt(rawOut);
      if (amountOut === 0n) return null;
      const feeAmount = BigInt(result.fee_amount ?? "0");
      const fee = amountIn > 0n ? Number(feeAmount) / Number(amountIn) : 3e-3;
      const sqrtPriceAfter = BigInt(result.sqrt_price ?? "0");
      let priceImpact = 0;
      if (amountIn > 0n) {
        const executedRate = Number(amountOut) / Number(amountIn);
        priceImpact = 0;
      }
      return {
        protocol: "turbos",
        poolId,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee,
        priceImpact
      };
    } catch {
      return null;
    }
  }
  /**
   * Build a Turbos swap transaction appended to an existing PTB.
   * Returns the output coin argument for chaining.
   */
  async buildSwapCall(poolId, tokenIn, tokenOut, amountIn, amountOutMin, senderAddress) {
    try {
      const a2b = tokenIn.type < tokenOut.type;
      const [result] = await this.sdk.trade.computeSwapResultV2({
        pools: [{ pool: poolId, a2b, amountSpecified: amountIn.toString() }],
        address: senderAddress,
        amountSpecifiedIsInput: true
      });
      if (!result) throw new Error("No swap result");
      const tickBits = result.tick_current_index?.bits ?? 0;
      const nextTickIndex = this.sdk.math ? this.sdk.math.bitsToNumber(tickBits) : tickBits;
      const tx = await this.sdk.trade.swap({
        routes: [{ pool: poolId, a2b, nextTickIndex }],
        coinTypeA: a2b ? tokenIn.type : tokenOut.type,
        coinTypeB: a2b ? tokenOut.type : tokenIn.type,
        address: senderAddress,
        amountA: a2b ? amountIn.toString() : amountOutMin.toString(),
        amountB: a2b ? amountOutMin.toString() : amountIn.toString(),
        amountSpecifiedIsInput: true,
        slippage: "1",
        // 1% — caller controls minOut via amountOutMin
        deadline: 6e4
      });
      return tx;
    } catch (err) {
      throw new Error(`TurbosPool.buildSwapCall failed: ${err}`);
    }
  }
};

// src/pools/flowx.ts
import { AggregatorQuoter, TradeBuilder } from "@flowx-finance/sdk";
var FlowXPool = class {
  quoter;
  network;
  // Route cache for PTB builder use — keyed by `tokenIn|tokenOut|amountIn`
  routeCache = /* @__PURE__ */ new Map();
  CACHE_TTL = 3e4;
  constructor(network) {
    this.network = network;
    this.quoter = new AggregatorQuoter(network);
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const result = await this.quoter.getRoutes({
        tokenIn: tokenIn.type,
        tokenOut: tokenOut.type,
        amountIn: amountIn.toString()
      });
      if (!result) return null;
      const amountOut = BigInt(result.amountOut.toString());
      if (amountOut === 0n) return null;
      const key = this.cacheKey(tokenIn, tokenOut, amountIn);
      this.routeCache.set(key, {
        routes: result.routes,
        expiry: Date.now() + this.CACHE_TTL
      });
      let priceImpact = 0;
      try {
        const pi = result.priceImpact;
        priceImpact = Math.max(0, Number(pi.toFixed?.(6) ?? pi) / 100);
      } catch {
        priceImpact = 0;
      }
      return {
        protocol: "flowx",
        poolId: `flowx:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee: 3e-3,
        // FlowX default AMM fee 0.3 %
        priceImpact
      };
    } catch {
      return null;
    }
  }
  getCachedRoutes(tokenIn, tokenOut, amountIn) {
    const entry = this.routeCache.get(this.cacheKey(tokenIn, tokenOut, amountIn));
    if (!entry || Date.now() > entry.expiry) return null;
    return entry.routes;
  }
  /**
   * Build a FlowX swap transaction from cached routes.
   */
  async buildSwapTransaction(tokenIn, tokenOut, amountIn, slippage, senderAddress) {
    const routes = this.getCachedRoutes(tokenIn, tokenOut, amountIn);
    if (!routes || routes.length === 0) return null;
    try {
      const trade = new TradeBuilder(this.network, routes).sender(senderAddress).slippage(slippage * 1e6).commission(null).build();
      return null;
    } catch {
      return null;
    }
  }
  cacheKey(tokenIn, tokenOut, amountIn) {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`;
  }
};

// src/pools/hop.ts
import { HopApi } from "@hop.ag/sdk";
var SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";
var HopPool = class {
  sdk;
  // Cache quote responses for PTB building
  quoteCache = /* @__PURE__ */ new Map();
  CACHE_TTL = 3e4;
  constructor(_network) {
    this.sdk = new HopApi({
      sui_rpc_url: SUI_MAINNET_RPC,
      fee_bps: 0,
      fee_address: ""
    });
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const result = await this.sdk.quote({
        coin_in: tokenIn.type,
        coin_out: tokenOut.type,
        amount_in: amountIn
      });
      if (!result || result.amount_out === 0) return null;
      const amountOut = BigInt(Math.floor(result.amount_out));
      if (amountOut === 0n) return null;
      const key = this.cacheKey(tokenIn, tokenOut, amountIn);
      this.quoteCache.set(key, { quote: result, expiry: Date.now() + this.CACHE_TTL });
      const priceImpact = Math.max(0, Math.min(1, result.price_impact ?? 0));
      let fee = 3e-3;
      try {
        const totalIn = result.amount_in;
        if (totalIn > 0 && result.routes.length > 0) {
          let weightedFee = 0;
          let totalWeight = 0;
          for (const route of result.routes) {
            const weight = route.amount_in / totalIn;
            for (const leg of route.legs) {
              const legFee = leg.splits.reduce(
                (acc, s) => acc + s.fee_rate * (s.amount_in / (leg.total_in || 1)),
                0
              );
              weightedFee += legFee * weight;
              totalWeight += weight;
            }
          }
          if (totalWeight > 0) fee = weightedFee / totalWeight;
        }
      } catch {
        fee = 3e-3;
      }
      return {
        protocol: "hop",
        poolId: `hop:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee,
        priceImpact
      };
    } catch {
      return null;
    }
  }
  getCachedQuote(tokenIn, tokenOut, amountIn) {
    const entry = this.quoteCache.get(this.cacheKey(tokenIn, tokenOut, amountIn));
    if (!entry || Date.now() > entry.expiry) return null;
    return entry.quote;
  }
  getSdk() {
    return this.sdk;
  }
  cacheKey(tokenIn, tokenOut, amountIn) {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`;
  }
};

// src/pools/sevenkprotocol.ts
import { coinWithBalance } from "@mysten/sui/transactions";
var SevenKProtocolPool = class {
  constructor(network) {
    this.network = network;
  }
  network;
  // Lazy-loaded to avoid static-import failures when the consumer's @mysten/sui
  // version doesn't match what @7kprotocol/sdk-ts was built against.
  metaAgPromise = null;
  quoteCache = /* @__PURE__ */ new Map();
  CACHE_TTL = 3e4;
  getMetaAg() {
    if (!this.metaAgPromise) {
      this.metaAgPromise = import("@7kprotocol/sdk-ts").then((mod) => new mod.MetaAg()).catch((err) => {
        this.metaAgPromise = null;
        throw err;
      });
    }
    return this.metaAgPromise;
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      const metaAg = await this.getMetaAg();
      const quotes = await metaAg.quote({
        coinTypeIn: tokenIn.type,
        coinTypeOut: tokenOut.type,
        amountIn: amountIn.toString(),
        timeout: 5e3
      });
      if (!quotes || quotes.length === 0) return null;
      const best = quotes.filter((q) => BigInt(q.amountOut) > 0n).sort((a, b) => {
        const aOut = BigInt(a.simulatedAmountOut ?? a.amountOut);
        const bOut = BigInt(b.simulatedAmountOut ?? b.amountOut);
        return bOut > aOut ? 1 : bOut < aOut ? -1 : 0;
      })[0];
      if (!best) return null;
      const amountOut = BigInt(best.simulatedAmountOut ?? best.amountOut);
      if (amountOut === 0n) return null;
      const key = this.cacheKey(tokenIn, tokenOut, amountIn);
      this.quoteCache.set(key, { metaQuote: best, expiry: Date.now() + this.CACHE_TTL });
      const rawOut = BigInt(best.rawAmountOut);
      const simOut = BigInt(best.simulatedAmountOut ?? best.rawAmountOut);
      const priceImpact = rawOut > 0n && simOut < rawOut ? Math.max(0, Number(rawOut - simOut) / Number(rawOut)) : 0;
      const fee = 3e-3;
      return {
        protocol: "sevenkprotocol",
        poolId: `7k:${best.provider}:${tokenIn.type}:${tokenOut.type}`,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        fee,
        priceImpact
      };
    } catch {
      return null;
    }
  }
  getCachedQuote(tokenIn, tokenOut, amountIn) {
    const entry = this.quoteCache.get(this.cacheKey(tokenIn, tokenOut, amountIn));
    if (!entry || Date.now() > entry.expiry) return null;
    return entry.metaQuote;
  }
  async addSwapToTransaction(tx, tokenIn, tokenOut, amountIn, senderAddress, slippageBps = 100, coinInOverride) {
    const metaAg = await this.getMetaAg();
    const cachedQuote = this.getCachedQuote(tokenIn, tokenOut, amountIn);
    if (!cachedQuote) {
      throw new Error("7K quote cache miss \u2014 call getQuote first.");
    }
    const coinIn = coinInOverride ?? coinWithBalance({
      balance: amountIn,
      type: tokenIn.type
    });
    const coinOut = await metaAg.swap(
      {
        quote: cachedQuote,
        signer: senderAddress,
        tx,
        coinIn
      },
      slippageBps
    );
    return { tx, coinOutId: coinOut };
  }
  cacheKey(tokenIn, tokenOut, amountIn) {
    return `${tokenIn.type}|${tokenOut.type}|${amountIn}`;
  }
};

// src/pools/aggregator.ts
function safe(p) {
  return p.catch(() => null);
}
var UNBUILDABLE_PROTOCOLS = ["turbos", "flowx", "hop", "cetus"];
var PoolAggregator = class {
  constructor(deepbook, cetus, aftermath, turbos, hop, sevenkprotocol, flowx) {
    this.deepbook = deepbook;
    this.cetus = cetus;
    this.aftermath = aftermath;
    this.turbos = turbos;
    this.hop = hop;
    this.sevenkprotocol = sevenkprotocol;
    this.flowx = flowx;
  }
  deepbook;
  cetus;
  aftermath;
  turbos;
  hop;
  sevenkprotocol;
  flowx;
  async getBestQuote(tokenIn, tokenOut, amountIn, excludeProtocols = []) {
    const quotes = await this.getAllQuotes(tokenIn, tokenOut, amountIn, excludeProtocols);
    return quotes[0] ?? null;
  }
  async getAllQuotes(tokenIn, tokenOut, amountIn, excludeProtocols = []) {
    const exclude = Array.from(/* @__PURE__ */ new Set([...excludeProtocols, ...UNBUILDABLE_PROTOCOLS]));
    excludeProtocols = exclude;
    const queries = [];
    if (!excludeProtocols.includes("deepbook")) {
      queries.push(safe(this.deepbook.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (!excludeProtocols.includes("cetus")) {
      queries.push(safe(this.cetus.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (this.aftermath && !excludeProtocols.includes("aftermath")) {
      queries.push(safe(this.aftermath.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (this.turbos && !excludeProtocols.includes("turbos")) {
      queries.push(safe(this.turbos.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (this.hop && !excludeProtocols.includes("hop")) {
      queries.push(safe(this.hop.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (this.sevenkprotocol && !excludeProtocols.includes("sevenkprotocol")) {
      queries.push(safe(this.sevenkprotocol.getQuote(tokenIn, tokenOut, amountIn)));
    }
    if (this.flowx && !excludeProtocols.includes("flowx")) {
      queries.push(safe(this.flowx.getQuote(tokenIn, tokenOut, amountIn)));
    }
    const results = await Promise.allSettled(queries);
    return results.filter(
      (r) => r.status === "fulfilled" && r.value !== null
    ).map((r) => r.value).sort((a, b) => b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0);
  }
};

// src/router/pathfinder.ts
var BRIDGE_TOKENS = ["USDC", "SUI", "USDT", "DBUSDC"];
var HOP_TIMEOUT_MS = 6e3;
var Pathfinder = class {
  constructor(aggregator) {
    this.aggregator = aggregator;
  }
  aggregator;
  async findBestRoute(tokenIn, tokenOut, amountIn, maxHops = 3, excludeProtocols = []) {
    const bridgeSymbols = maxHops >= 2 ? BRIDGE_TOKENS.filter((sym) => sym !== tokenIn.symbol && sym !== tokenOut.symbol) : [];
    const [directStep, ...hopRoutes] = await Promise.all([
      this.aggregator.getBestQuote(tokenIn, tokenOut, amountIn, excludeProtocols),
      ...bridgeSymbols.map(
        (sym) => this.tryHop(tokenIn, tokenOut, amountIn, sym, excludeProtocols)
      )
    ]);
    const routes = [];
    if (directStep) {
      routes.push({
        steps: [directStep],
        type: "direct",
        totalAmountOut: directStep.amountOut,
        totalPriceImpact: directStep.priceImpact,
        totalFees: directStep.fee
      });
    }
    for (const route of hopRoutes) {
      if (route) routes.push(route);
    }
    if (routes.length === 0) return null;
    return routes.reduce(
      (best, current) => current.totalAmountOut > best.totalAmountOut ? current : best
    );
  }
  async tryHop(tokenIn, tokenOut, amountIn, bridgeSymbol, excludeProtocols) {
    const bridge = getTokenBySymbol(bridgeSymbol);
    if (!bridge) return null;
    try {
      return await Promise.race([
        this._tryHopInternal(tokenIn, tokenOut, amountIn, bridge, excludeProtocols),
        new Promise((resolve) => setTimeout(() => resolve(null), HOP_TIMEOUT_MS))
      ]);
    } catch {
      return null;
    }
  }
  async _tryHopInternal(tokenIn, tokenOut, amountIn, bridge, excludeProtocols) {
    const leg1 = await this.aggregator.getBestQuote(tokenIn, bridge, amountIn, excludeProtocols);
    if (!leg1) return null;
    const leg2 = await this.aggregator.getBestQuote(bridge, tokenOut, leg1.amountOut, excludeProtocols);
    if (!leg2) return null;
    return {
      steps: [leg1, leg2],
      type: "single-hop",
      totalAmountOut: leg2.amountOut,
      totalPriceImpact: leg1.priceImpact + leg2.priceImpact,
      totalFees: leg1.fee + leg2.fee
    };
  }
};

// src/ptb/builder.ts
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient as SuiClient2, getJsonRpcFullnodeUrl as getFullnodeUrl2 } from "@mysten/sui/jsonRpc";
import { TransactionUtil } from "@cetusprotocol/cetus-sui-clmm-sdk";

// src/utils/math.ts
function applySlippage(amount, slippage) {
  return BigInt(Math.floor(Number(amount) * (1 - slippage)));
}

// src/ptb/builder.ts
var BUILDABLE_PROTOCOLS = ["deepbook", "cetus", "aftermath", "sevenkprotocol"];
var PTBBuilder = class {
  constructor(network, deepbookPool, cetusPool, aftermathPool, sevenkPool) {
    this.network = network;
    this.deepbookPool = deepbookPool;
    this.cetusPool = cetusPool;
    this.aftermathPool = aftermathPool;
    this.sevenkPool = sevenkPool;
    this.suiClient = new SuiClient2({ url: getFullnodeUrl2(network) });
  }
  network;
  deepbookPool;
  cetusPool;
  aftermathPool;
  sevenkPool;
  suiClient;
  async buildFromRoute(route, senderAddress, slippageTolerance) {
    let tx = new Transaction();
    tx.setSender(senderAddress);
    if (route.steps.length === 1) {
      tx = await this.buildSingleStep(tx, route.steps[0], senderAddress, slippageTolerance);
    } else {
      tx = await this.buildMultiStep(tx, route.steps, senderAddress, slippageTolerance);
    }
    return tx;
  }
  async buildSingleStep(tx, step, senderAddress, slippage) {
    const minOut = applySlippage(step.amountOut, slippage);
    if (step.protocol === "deepbook") {
      const client = this.deepbookPool.getDeepBookClient();
      const poolKey = this.deepbookPool.getPoolKeyForPair(step.tokenIn, step.tokenOut);
      const isBaseToCoin = this.deepbookPool.isBaseCoin(poolKey, step.tokenIn);
      const amountHuman = fromBaseUnits(step.amountIn, step.tokenIn);
      const minOutHuman = fromBaseUnits(minOut, step.tokenOut);
      const [baseCoin, quoteCoin, _deepCoin] = tx.add(
        client.deepBook.swapExactQuantity({
          poolKey,
          amount: amountHuman,
          deepAmount: 0,
          minOut: minOutHuman,
          isBaseToCoin
        })
      );
      const outCoin = isBaseToCoin ? quoteCoin : baseCoin;
      tx.transferObjects([outCoin], senderAddress);
    } else if (step.protocol === "cetus") {
      await this.buildCetusStep(tx, step, senderAddress, slippage, null);
    } else if (step.protocol === "aftermath") {
      const { tx: updatedTx, coinOutId } = await this.buildAftermathStep(tx, step, senderAddress, slippage, void 0);
      tx = updatedTx;
      if (coinOutId) tx.transferObjects([coinOutId], senderAddress);
    } else if (step.protocol === "sevenkprotocol") {
      const { tx: updatedTx, coinOutId } = await this.buildSevenKStep(tx, step, senderAddress, slippage, void 0);
      tx = updatedTx;
      if (coinOutId) tx.transferObjects([coinOutId], senderAddress);
    } else {
      throw new Error(
        `PTB builder does not support protocol "${step.protocol}". Buildable: ${BUILDABLE_PROTOCOLS.join(", ")}. Exclude unsupported protocols via getQuote({ excludeProtocols: [...] }) or upgrade routex-sui.`
      );
    }
    return tx;
  }
  async buildMultiStep(tx, steps, senderAddress, slippage) {
    let intermediateCoin = null;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isLast = i === steps.length - 1;
      const stepMinOut = isLast ? applySlippage(step.amountOut, slippage) : 0n;
      if (step.protocol === "deepbook") {
        const client = this.deepbookPool.getDeepBookClient();
        const poolKey = this.deepbookPool.getPoolKeyForPair(step.tokenIn, step.tokenOut);
        const isBaseToCoin = this.deepbookPool.isBaseCoin(poolKey, step.tokenIn);
        const amountHuman = fromBaseUnits(step.amountIn, step.tokenIn);
        const minOutHuman = fromBaseUnits(stepMinOut, step.tokenOut);
        const [baseCoin, quoteCoin, _deepCoin] = tx.add(
          client.deepBook.swapExactQuantity({
            poolKey,
            amount: amountHuman,
            deepAmount: 0,
            minOut: minOutHuman,
            isBaseToCoin
          })
        );
        intermediateCoin = isBaseToCoin ? quoteCoin : baseCoin;
        if (isLast) {
          tx.transferObjects([intermediateCoin], senderAddress);
        }
      } else if (step.protocol === "cetus") {
        intermediateCoin = await this.buildCetusStep(tx, step, senderAddress, slippage, intermediateCoin);
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress);
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`Cetus step ${i} produced no output coin for chaining`);
        }
      } else if (step.protocol === "aftermath") {
        const { tx: updatedTx, coinOutId } = await this.buildAftermathStep(
          tx,
          step,
          senderAddress,
          slippage,
          intermediateCoin ?? void 0
        );
        tx = updatedTx;
        intermediateCoin = coinOutId;
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress);
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`Aftermath step ${i} produced no output coin for chaining`);
        }
      } else if (step.protocol === "sevenkprotocol") {
        const { tx: updatedTx, coinOutId } = await this.buildSevenKStep(
          tx,
          step,
          senderAddress,
          slippage,
          intermediateCoin ?? void 0
        );
        tx = updatedTx;
        intermediateCoin = coinOutId;
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress);
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`7K step ${i} produced no output coin for chaining`);
        }
      } else {
        throw new Error(
          `PTB builder does not support protocol "${step.protocol}" at step ${i}. Buildable: ${BUILDABLE_PROTOCOLS.join(", ")}. Exclude unsupported protocols via getQuote({ excludeProtocols: [...] }).`
        );
      }
    }
    return tx;
  }
  async buildCetusStep(tx, step, senderAddress, slippage, inputCoin) {
    const sdk = this.cetusPool.getSdk();
    const sdkOptions = sdk.sdkOptions;
    const minOut = applySlippage(step.amountOut, slippage);
    const pool = await this.cetusPool.getPool(step.poolId);
    if (!pool) {
      throw new Error(`Cetus pool ${step.poolId} not found on-chain`);
    }
    const a2b = coinTypesEqual(pool.coinTypeA, step.tokenIn.type);
    const coinTypeA = pool.coinTypeA;
    const coinTypeB = pool.coinTypeB;
    const params = {
      pool_id: step.poolId,
      a2b,
      by_amount_in: true,
      amount: step.amountIn.toString(),
      amount_limit: minOut.toString(),
      coinTypeA,
      coinTypeB
    };
    if (inputCoin) {
      const primaryCoinInput = {
        targetCoin: inputCoin,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: step.amountIn.toString()
      };
      const zeroCoinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, step.tokenOut.type),
        remainCoins: [],
        isMintZeroCoin: true,
        tragetCoinAmount: "0"
      };
      const { txRes } = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
        sdk,
        tx,
        params,
        sdkOptions,
        primaryCoinInput,
        zeroCoinInput
      );
      return a2b ? txRes[1] : txRes[0];
    } else {
      const coinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(step.amountIn, step.tokenIn.type),
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: step.amountIn.toString()
      };
      const zeroCoinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, step.tokenOut.type),
        remainCoins: [],
        isMintZeroCoin: true,
        tragetCoinAmount: "0"
      };
      const { tx: builtTx, txRes } = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
        sdk,
        tx,
        params,
        sdkOptions,
        coinInput,
        zeroCoinInput
      );
      const outCoin = a2b ? txRes[1] : txRes[0];
      tx.transferObjects([outCoin], senderAddress);
      return outCoin;
    }
  }
  async buildAftermathStep(tx, step, senderAddress, slippage, coinInId) {
    if (!this.aftermathPool) {
      throw new Error("AftermathPool not configured on PTBBuilder");
    }
    const route = this.aftermathPool.getCachedRoute(step.tokenIn, step.tokenOut, step.amountIn);
    if (!route) {
      throw new Error(
        "Aftermath route cache miss \u2014 quote expired or was never fetched. Call getQuote first."
      );
    }
    return this.aftermathPool.addSwapToTransaction(tx, route, slippage, senderAddress, coinInId);
  }
  async buildSevenKStep(tx, step, senderAddress, slippage, coinInId) {
    if (!this.sevenkPool) {
      throw new Error("SevenKProtocolPool not configured on PTBBuilder");
    }
    const slippageBps = Math.max(1, Math.floor(slippage * 1e4));
    return this.sevenkPool.addSwapToTransaction(
      tx,
      step.tokenIn,
      step.tokenOut,
      step.amountIn,
      senderAddress,
      slippageBps,
      coinInId
    );
  }
  applySlippage(amount, slippage) {
    return applySlippage(amount, slippage);
  }
  async estimateGas(ptb, senderAddress) {
    try {
      ptb.setSender(senderAddress);
      const bytes = await ptb.build({ client: this.suiClient });
      const dryRun = await Promise.race([
        this.suiClient.dryRunTransactionBlock({ transactionBlock: bytes }),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Gas estimate timeout")), 2e3)
        )
      ]);
      const gasUsed = dryRun.effects.gasUsed;
      return BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost);
    } catch {
      return BigInt(5e6);
    }
  }
};

// src/ptb/executor.ts
import { SuiJsonRpcClient as SuiClient3, getJsonRpcFullnodeUrl as getFullnodeUrl3 } from "@mysten/sui/jsonRpc";
var PTBExecutor = class {
  client;
  constructor(network) {
    this.client = new SuiClient3({ url: getFullnodeUrl3(network) });
  }
  async execute(ptb, signer) {
    if (typeof signer.getPublicKey === "function") {
      ptb.setSender(signer.getPublicKey().toSuiAddress());
    }
    const bytes = await ptb.build({ client: this.client });
    let txBase64;
    let signature;
    if (typeof signer.signTransaction === "function") {
      const result2 = await signer.signTransaction(bytes);
      txBase64 = result2.bytes;
      signature = result2.signature;
    } else if (typeof signer.signTransactionBlock === "function") {
      const result2 = await signer.signTransactionBlock({ transactionBlock: ptb });
      return { digest: result2.digest, actualAmountOut: 0n };
    } else {
      throw new Error(
        "Signer must implement signTransaction(bytes: Uint8Array) or signTransactionBlock({ transactionBlock }). Pass an Ed25519Keypair or a Sui wallet adapter."
      );
    }
    const result = await this.client.executeTransactionBlock({
      transactionBlock: txBase64,
      signature: [signature],
      options: { showEffects: true, showObjectChanges: true }
    });
    if (result.effects?.status.status !== "success") {
      throw new Error(`Transaction failed: ${result.effects?.status.error ?? "unknown error"}`);
    }
    return {
      digest: result.digest,
      actualAmountOut: 0n
      // parsing coin changes from effects is left for a later pass
    };
  }
};

// src/index.ts
var Routex = class {
  aggregator;
  pathfinder;
  ptbBuilder;
  executor;
  deepbookPool;
  cetusPool;
  aftermathPool;
  turbosPool;
  flowxPool;
  hopPool;
  sevenkPool;
  network;
  constructor(network = "mainnet", senderAddress) {
    this.network = network;
    setNetwork(network);
    this.deepbookPool = new DeepBookPool(network, senderAddress);
    this.cetusPool = new CetusPool(network, senderAddress);
    this.aftermathPool = new AftermathPool(network);
    this.turbosPool = new TurbosPool(network);
    this.flowxPool = new FlowXPool(network);
    this.hopPool = new HopPool(network);
    this.sevenkPool = new SevenKProtocolPool(network);
    this.aggregator = new PoolAggregator(
      this.deepbookPool,
      this.cetusPool,
      this.aftermathPool,
      this.turbosPool,
      this.hopPool,
      this.sevenkPool,
      this.flowxPool
    );
    this.pathfinder = new Pathfinder(this.aggregator);
    this.ptbBuilder = new PTBBuilder(
      network,
      this.deepbookPool,
      this.cetusPool,
      this.aftermathPool,
      this.sevenkPool
    );
    this.executor = new PTBExecutor(network);
  }
  setSenderAddress(address) {
    this.cetusPool.updateSender(address);
  }
  async getQuote(params) {
    const tokenIn = resolveToken(params.from);
    const tokenOut = resolveToken(params.to);
    const amountIn = BigInt(params.amount);
    const slippage = params.slippageTolerance ?? 5e-3;
    const senderAddress = params.senderAddress ?? "0x0000000000000000000000000000000000000000000000000000000000000001";
    const route = await this.pathfinder.findBestRoute(
      tokenIn,
      tokenOut,
      amountIn,
      params.maxHops ?? 3,
      params.excludeProtocols ?? []
    );
    if (!route) {
      throw new Error(`No route found from ${params.from} to ${params.to}`);
    }
    let ptb;
    let gasEstimate;
    ptb = await this.ptbBuilder.buildFromRoute(route, senderAddress, slippage);
    try {
      gasEstimate = await this.ptbBuilder.estimateGas(ptb, senderAddress);
    } catch {
      gasEstimate = BigInt(5e6);
    }
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
        breakdown: route.steps.map((s) => ({ protocol: s.protocol, fee: s.fee }))
      },
      gasEstimate,
      slippageTolerance: slippage,
      ptb,
      validUntil: Date.now() + 3e4,
      routeType: route.type
    };
  }
  async execute(params) {
    if (Date.now() > params.quote.validUntil) {
      throw new Error("Quote expired \u2014 call getQuote again.");
    }
    const senderAddress = typeof params.signer.getPublicKey === "function" ? params.signer.getPublicKey().toSuiAddress() : "";
    const internalRoute = {
      steps: params.quote.route,
      type: params.quote.routeType,
      totalAmountOut: params.quote.amountOut,
      totalPriceImpact: params.quote.priceImpact,
      totalFees: params.quote.fees.total
    };
    const ptb = await this.ptbBuilder.buildFromRoute(
      internalRoute,
      senderAddress,
      params.quote.slippageTolerance
    );
    return this.executor.execute(ptb, params.signer);
  }
};
var index_default = Routex;
export {
  Routex,
  index_default as default,
  getTokenBySymbol,
  resolveToken
};
//# sourceMappingURL=index.js.map