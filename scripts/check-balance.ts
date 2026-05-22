import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'

const key = process.argv[2]
const network = (process.argv[3] ?? 'mainnet') as 'mainnet' | 'testnet'

if (!key) { console.error('Usage: tsx check-balance.ts <privkey> [mainnet|testnet]'); process.exit(1) }

const keypair = Ed25519Keypair.fromSecretKey(key)
const address = keypair.getPublicKey().toSuiAddress()
console.log('Address:', address)
console.log('Network:', network)

const RPCS = {
  mainnet: [
    'https://fullnode.mainnet.sui.io:443',
    'https://sui-mainnet-rpc.allthatnode.com',
    'https://mainnet.suiet.app',
  ],
  testnet: ['https://fullnode.testnet.sui.io:443'],
}

for (const url of RPCS[network]) {
  try {
    const client = new SuiJsonRpcClient({ url })
    const balance = await client.getBalance({ owner: address })
    console.log(`Balance: ${Number(balance.totalBalance) / 1e9} SUI  (via ${url})`)
    process.exit(0)
  } catch (e: any) {
    console.log(`  ${url} — failed: ${e?.cause?.code ?? e?.message}`)
  }
}
