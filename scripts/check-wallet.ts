import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'

const key = process.argv[2]
const digest1 = process.argv[3]
const digest2 = process.argv[4]

const keypair = Ed25519Keypair.fromSecretKey(key)
const address = keypair.getPublicKey().toSuiAddress()
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet') })

console.log('Address:', address)

// All coin balances
const allBalances = await client.getAllBalances({ owner: address })
console.log('\nAll coin balances:')
for (const b of allBalances) {
  console.log(`  ${b.coinType.split('::').slice(-1)[0].padEnd(10)} ${Number(b.totalBalance) / 1e9}`)
}

// Verify transactions
for (const digest of [digest1, digest2].filter(Boolean)) {
  const tx = await client.getTransactionBlock({
    digest,
    options: { showEffects: true, showBalanceChanges: true },
  })
  console.log(`\nTx ${digest}:`)
  console.log(`  Status : ${tx.effects?.status.status}`)
  console.log(`  Changes:`)
  for (const change of tx.balanceChanges ?? []) {
    if (change.owner && typeof change.owner === 'object' && 'AddressOwner' in change.owner) {
      const coin = change.coinType.split('::').slice(-1)[0]
      const amount = Number(change.amount) / 1e9
      console.log(`    ${coin.padEnd(10)} ${amount > 0 ? '+' : ''}${amount}`)
    }
  }
}
