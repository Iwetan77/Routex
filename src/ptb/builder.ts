import { Transaction } from '@mysten/sui/transactions'
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc'
import { TransactionUtil, type CetusClmmSDK } from '@cetusprotocol/cetus-sui-clmm-sdk'
import type { DeepBookPool } from '../pools/deepbook.js'
import type { CetusPool } from '../pools/cetus.js'
import type { AftermathPool } from '../pools/aftermath.js'
import type { SevenKProtocolPool } from '../pools/sevenkprotocol.js'
import type { Route, RouteStep } from '../types.js'
import { applySlippage } from '../utils/math.js'
import { fromBaseUnits, coinTypesEqual } from '../utils/tokens.js'

/** Protocols the PTB builder can actually emit transaction calls for. */
export const BUILDABLE_PROTOCOLS = ['deepbook', 'cetus', 'aftermath', 'sevenkprotocol'] as const
type BuildableProtocol = (typeof BUILDABLE_PROTOCOLS)[number]

export class PTBBuilder {
  private suiClient: SuiClient

  constructor(
    private network: 'mainnet' | 'testnet',
    private deepbookPool: DeepBookPool,
    private cetusPool: CetusPool,
    private aftermathPool?: AftermathPool,
    private sevenkPool?: SevenKProtocolPool,
  ) {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) })
  }

  async buildFromRoute(
    route: Route,
    senderAddress: string,
    slippageTolerance: number,
  ): Promise<Transaction> {
    let tx = new Transaction()
    tx.setSender(senderAddress)

    if (route.steps.length === 1) {
      tx = await this.buildSingleStep(tx, route.steps[0], senderAddress, slippageTolerance)
    } else {
      tx = await this.buildMultiStep(tx, route.steps, senderAddress, slippageTolerance)
    }

    return tx
  }

  private async buildSingleStep(
    tx: Transaction,
    step: RouteStep,
    senderAddress: string,
    slippage: number,
  ): Promise<Transaction> {
    const minOut = applySlippage(step.amountOut, slippage)

    if (step.protocol === 'deepbook') {
      const client = this.deepbookPool.getDeepBookClient()
      const poolKey = this.deepbookPool.getPoolKeyForPair(step.tokenIn, step.tokenOut)!
      const isBaseToCoin = this.deepbookPool.isBaseCoin(poolKey, step.tokenIn)
      const amountHuman = fromBaseUnits(step.amountIn, step.tokenIn)
      const minOutHuman = fromBaseUnits(minOut, step.tokenOut)

      const [baseCoin, quoteCoin, _deepCoin] = tx.add(
        client.deepBook.swapExactQuantity({
          poolKey,
          amount: amountHuman,
          deepAmount: 0,
          minOut: minOutHuman,
          isBaseToCoin,
        }),
      )

      const outCoin = isBaseToCoin ? quoteCoin : baseCoin
      tx.transferObjects([outCoin], senderAddress)
    } else if (step.protocol === 'cetus') {
      // buildCetusStep transfers to sender internally for single-step
      await this.buildCetusStep(tx, step, senderAddress, slippage, null)
    } else if (step.protocol === 'aftermath') {
      const { tx: updatedTx, coinOutId } = await this.buildAftermathStep(tx, step, senderAddress, slippage, undefined)
      tx = updatedTx
      if (coinOutId) tx.transferObjects([coinOutId], senderAddress)
    } else if (step.protocol === 'sevenkprotocol') {
      const { tx: updatedTx, coinOutId } = await this.buildSevenKStep(tx, step, senderAddress, slippage, undefined)
      tx = updatedTx
      if (coinOutId) tx.transferObjects([coinOutId], senderAddress)
    } else {
      throw new Error(
        `PTB builder does not support protocol "${step.protocol}". ` +
        `Buildable: ${BUILDABLE_PROTOCOLS.join(', ')}. ` +
        `Exclude unsupported protocols via getQuote({ excludeProtocols: [...] }) or upgrade routex-sui.`,
      )
    }

    return tx
  }

  private async buildMultiStep(
    tx: Transaction,
    steps: RouteStep[],
    senderAddress: string,
    slippage: number,
  ): Promise<Transaction> {
    let intermediateCoin: any = null

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const isLast = i === steps.length - 1
      const stepMinOut = isLast ? applySlippage(step.amountOut, slippage) : 0n

      if (step.protocol === 'deepbook') {
        const client = this.deepbookPool.getDeepBookClient()
        const poolKey = this.deepbookPool.getPoolKeyForPair(step.tokenIn, step.tokenOut)!
        const isBaseToCoin = this.deepbookPool.isBaseCoin(poolKey, step.tokenIn)
        const amountHuman = fromBaseUnits(step.amountIn, step.tokenIn)
        const minOutHuman = fromBaseUnits(stepMinOut, step.tokenOut)

        const [baseCoin, quoteCoin, _deepCoin] = tx.add(
          client.deepBook.swapExactQuantity({
            poolKey,
            amount: amountHuman,
            deepAmount: 0,
            minOut: minOutHuman,
            isBaseToCoin,
          }),
        )

        intermediateCoin = isBaseToCoin ? quoteCoin : baseCoin

        if (isLast) {
          tx.transferObjects([intermediateCoin], senderAddress)
        }
      } else if (step.protocol === 'cetus') {
        intermediateCoin = await this.buildCetusStep(tx, step, senderAddress, slippage, intermediateCoin)
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress)
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`Cetus step ${i} produced no output coin for chaining`)
        }
      } else if (step.protocol === 'aftermath') {
        const { tx: updatedTx, coinOutId } = await this.buildAftermathStep(
          tx,
          step,
          senderAddress,
          slippage,
          intermediateCoin ?? undefined,
        )
        tx = updatedTx
        intermediateCoin = coinOutId
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress)
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`Aftermath step ${i} produced no output coin for chaining`)
        }
      } else if (step.protocol === 'sevenkprotocol') {
        const { tx: updatedTx, coinOutId } = await this.buildSevenKStep(
          tx,
          step,
          senderAddress,
          slippage,
          intermediateCoin ?? undefined,
        )
        tx = updatedTx
        intermediateCoin = coinOutId
        if (isLast && intermediateCoin) {
          tx.transferObjects([intermediateCoin], senderAddress)
        } else if (!isLast && !intermediateCoin) {
          throw new Error(`7K step ${i} produced no output coin for chaining`)
        }
      } else {
        throw new Error(
          `PTB builder does not support protocol "${step.protocol}" at step ${i}. ` +
          `Buildable: ${BUILDABLE_PROTOCOLS.join(', ')}. ` +
          `Exclude unsupported protocols via getQuote({ excludeProtocols: [...] }).`,
        )
      }
    }

    return tx
  }

  private async buildCetusStep(
    tx: Transaction,
    step: RouteStep,
    senderAddress: string,
    slippage: number,
    inputCoin: any,
  ): Promise<any> {
    const sdk = this.cetusPool.getSdk()
    const sdkOptions = sdk.sdkOptions
    const minOut = applySlippage(step.amountOut, slippage)

    // Fetch the actual pool object — its coinTypeA/B are the authoritative
    // on-chain ordering. Falling back to lexicographic comparison of the
    // route step's types is wrong when one type is short form (0x2::sui::SUI)
    // and the other is long form (0xdba3…::usdc::USDC): the comparison
    // returns the wrong direction and the swap goes backwards.
    const pool = await this.cetusPool.getPool(step.poolId)
    if (!pool) {
      throw new Error(`Cetus pool ${step.poolId} not found on-chain`)
    }
    const a2b = coinTypesEqual(pool.coinTypeA, step.tokenIn.type)
    const coinTypeA = pool.coinTypeA
    const coinTypeB = pool.coinTypeB

    const params = {
      pool_id: step.poolId,
      a2b,
      by_amount_in: true,
      amount: step.amountIn.toString(),
      amount_limit: minOut.toString(),
      coinTypeA,
      coinTypeB,
    }

    if (inputCoin) {
      // Multi-hop: use the intermediate coin as input
      const primaryCoinInput = {
        targetCoin: inputCoin,
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: step.amountIn.toString(),
      }
      const zeroCoinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, step.tokenOut.type),
        remainCoins: [],
        isMintZeroCoin: true,
        tragetCoinAmount: '0',
      }

      const { txRes } = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
        sdk,
        tx,
        params,
        sdkOptions,
        primaryCoinInput,
        zeroCoinInput,
      )

      // a2b: txRes[0]=coinA remaining, txRes[1]=coinB out
      // b2a: txRes[0]=coinA out, txRes[1]=coinB remaining
      return a2b ? txRes[1] : txRes[0]
    } else {
      // Single-step: SDK fetches coins from wallet via coinWithBalance
      const coinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(step.amountIn, step.tokenIn.type),
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: step.amountIn.toString(),
      }
      const zeroCoinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, step.tokenOut.type),
        remainCoins: [],
        isMintZeroCoin: true,
        tragetCoinAmount: '0',
      }

      const { tx: builtTx, txRes } = TransactionUtil.buildSwapTransactionWithoutTransferCoinArgs(
        sdk,
        tx,
        params,
        sdkOptions,
        coinInput,
        zeroCoinInput,
      )

      // Pick the output coin based on swap direction
      const outCoin = a2b ? txRes[1] : txRes[0]
      tx.transferObjects([outCoin], senderAddress)
      return outCoin
    }
  }

  private async buildAftermathStep(
    tx: Transaction,
    step: RouteStep,
    senderAddress: string,
    slippage: number,
    coinInId: any | undefined,
  ): Promise<{ tx: Transaction; coinOutId: any }> {
    if (!this.aftermathPool) {
      throw new Error('AftermathPool not configured on PTBBuilder')
    }

    const route = this.aftermathPool.getCachedRoute(step.tokenIn, step.tokenOut, step.amountIn)
    if (!route) {
      throw new Error(
        'Aftermath route cache miss — quote expired or was never fetched. Call getQuote first.',
      )
    }

    // Aftermath returns a NEW Transaction — must use it going forward
    return this.aftermathPool.addSwapToTransaction(tx, route, slippage, senderAddress, coinInId)
  }

  private async buildSevenKStep(
    tx: Transaction,
    step: RouteStep,
    senderAddress: string,
    slippage: number,
    coinInId: any | undefined,
  ): Promise<{ tx: Transaction; coinOutId: any }> {
    if (!this.sevenkPool) {
      throw new Error('SevenKProtocolPool not configured on PTBBuilder')
    }
    // 7K SDK takes slippage in bps (1 bps = 0.01%). Floor to 1 bps min so 0 never disables protection.
    const slippageBps = Math.max(1, Math.floor(slippage * 10_000))
    return this.sevenkPool.addSwapToTransaction(
      tx,
      step.tokenIn,
      step.tokenOut,
      step.amountIn,
      senderAddress,
      slippageBps,
      coinInId,
    )
  }

  applySlippage(amount: bigint, slippage: number): bigint {
    return applySlippage(amount, slippage)
  }

  async estimateGas(ptb: Transaction, senderAddress: string): Promise<bigint> {
    try {
      ptb.setSender(senderAddress)
      const bytes = await ptb.build({ client: this.suiClient as any })
      // dryRunTransactionBlock is a live RPC call — cap it at 2 s.
      const dryRun = await Promise.race([
        this.suiClient.dryRunTransactionBlock({ transactionBlock: bytes }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gas estimate timeout')), 2_000)
        ),
      ])
      const gasUsed = dryRun.effects.gasUsed
      return BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost)
    } catch {
      return BigInt(5_000_000) // fallback estimate: 0.005 SUI
    }
  }
}
