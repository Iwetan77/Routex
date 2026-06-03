import { Transaction } from '@mysten/sui/transactions';

interface Token {
    address: string;
    type: string;
    symbol: string;
    decimals: number;
    name: string;
    scalar: number;
}
interface RouteStep {
    protocol: 'deepbook' | 'cetus' | 'aftermath' | 'turbos' | 'flowx' | 'hop' | 'sevenkprotocol';
    poolId: string;
    tokenIn: Token;
    tokenOut: Token;
    amountIn: bigint;
    amountOut: bigint;
    fee: number;
    priceImpact: number;
}
interface RoutexQuote {
    from: Token;
    to: Token;
    amountIn: bigint;
    amountOut: bigint;
    minimumAmountOut: bigint;
    route: RouteStep[];
    priceImpact: number;
    fees: {
        total: number;
        breakdown: {
            protocol: string;
            fee: number;
        }[];
    };
    gasEstimate: bigint;
    /** The slippage tolerance used when this quote was fetched (e.g. 0.005 = 0.5%). */
    slippageTolerance: number;
    ptb: Transaction;
    validUntil: number;
    routeType: 'direct' | 'single-hop' | 'multi-hop';
}
interface GetQuoteParams {
    from: string;
    to: string;
    amount: bigint | number;
    slippageTolerance?: number;
    maxHops?: number;
    excludeProtocols?: string[];
    preferProtocol?: string;
    senderAddress?: string;
}
interface ExecuteParams {
    quote: RoutexQuote;
    signer: any;
}
interface ExecuteResult {
    digest: string;
    actualAmountOut: bigint;
}

declare function resolveToken(symbolOrType: string): Token;
declare function getTokenBySymbol(symbol: string): Token | null;

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
declare function setDebug(on: boolean): void;

declare class Routex {
    private aggregator;
    private pathfinder;
    private ptbBuilder;
    private executor;
    private deepbookPool;
    private cetusPool;
    private aftermathPool;
    private turbosPool;
    private flowxPool;
    private hopPool;
    private sevenkPool;
    private network;
    constructor(network?: 'mainnet' | 'testnet', senderAddress?: string);
    setSenderAddress(address: string): void;
    getQuote(params: GetQuoteParams): Promise<RoutexQuote>;
    execute(params: ExecuteParams): Promise<ExecuteResult>;
}

export { type ExecuteParams, type ExecuteResult, type GetQuoteParams, Routex, type RoutexQuote, Routex as default, getTokenBySymbol, resolveToken, setDebug };
