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

export { type ExecuteParams, type ExecuteResult, type GetQuoteParams, Routex, type RoutexQuote, Routex as default, getTokenBySymbol, resolveToken };
