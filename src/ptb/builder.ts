import { Transaction } from '@mysten/sui/transactions'
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc'
import { TransactionUtil, type CetusClmmSDK } from '@cetusprotocol/cetus-sui-clmm-sdk'
import type { DeepBookPool } from '../pools/deepbook.js'
import type { CetusPool } from '../pools/cetus.js'
import type { AftermathPool } from '../pools/aftermath.js'
import type { Route, RouteStep } from '../types.js'
import { applySlippage } from '../utils/math.js'
import { fromBaseUnits } from '../utils/tokens.js'

export class PTBBuilder {
  private suiClient: SuiClient

  constructor(
    private network: 'mainnet' | 'testnet',
    private deepbookPool: DeepBookPool,
    private cetusPool: CetusPool,
    private aftermathPool?: AftermathPool,
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
      this.buildCetusStep(tx, step, senderAddress, slippage, null)
    } else if (step.protocol === 'aftermath') {
      const { tx: updatedTx, coinOutId } = await this.buildAftermathStep(tx, step, senderAddress, slippage, undefined)
      tx = updatedTx
      if (coinOutId) tx.transferObjects([coinOutId], senderAddress)
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
        intermediateCoin = this.buildCetusStep(tx, step, senderAddress, slippage, intermediateCoin)
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
      }
    }

    return tx
  }

  private buildCetusStep(
    tx: Transaction,
    step: RouteStep,
    senderAddress: string,
    slippage: number,
    inputCoin: any,
  ): any {
    const sdk = this.cetusPool.getSdk()
    const sdkOptions = sdk.sdkOptions
    const a2b = true // determined by token order in pool
    const minOut = applySlippage(step.amountOut, slippage)

    const coinTypeA = step.tokenIn.type
    const coinTypeB = step.tokenOut.type

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
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, coinTypeB),
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

      // txRes[0] = coinA remaining, txRes[1] = coinB output
      return txRes[1]
    } else {
      // Single-step Cetus swap: let the SDK handle coin fetching via coinWithBalance
      const coinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(step.amountIn, coinTypeA),
        remainCoins: [],
        isMintZeroCoin: false,
        tragetCoinAmount: step.amountIn.toString(),
      }
      const zeroCoinInput = {
        targetCoin: TransactionUtil.buildCoinWithBalance(0n, coinTypeB),
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

      const outCoin = txRes[1] // coinB is always the output for a2b
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

  applySlippage(amount: bigint, slippage: number): bigint {
    return applySlippage(amount, slippage)
  }

  async estimateGas(ptb: Transaction, senderAddress: string): Promise<bigint> {
    try {
      ptb.setSender(senderAddress)
      const bytes = await ptb.build({ client: this.suiClient as any })
      const dryRun = await this.suiClient.dryRunTransactionBlock({
        transactionBlock: bytes,
      })
      const gasUsed = dryRun.effects.gasUsed
      return BigInt(gasUsed.computationCost) + BigInt(gasUsed.storageCost)
    } catch {
      return BigInt(5_000_000) // fallback estimate: 0.005 SUI
    }
  }
}
