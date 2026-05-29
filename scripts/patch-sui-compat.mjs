/**
 * Post-install compatibility shim for @mysten/sui v2 + @cetusprotocol/cetus-sui-clmm-sdk
 *
 * The Cetus SDK v5.x was compiled against @mysten/sui v1, where `SuiClient` and
 * `getFullnodeUrl` lived at `@mysten/sui/client`.  In @mysten/sui v2, those symbols
 * moved to `@mysten/sui/jsonRpc` and were renamed `SuiJsonRpcClient` /
 * `getJsonRpcFullnodeUrl`.  The `./client` path no longer re-exports them.
 *
 * This script appends backward-compatible re-exports to the ESM barrel so that
 * `require('@mysten/sui/client').SuiClient` returns the real v2 class.
 * It is idempotent (checks for the marker comment before patching).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// When installed as a package (node_modules/routex-sui/scripts/),
// @mysten/sui is a sibling at node_modules/@mysten/sui/ — two levels up.
// When run from source (routex/scripts/), it lives at routex/node_modules/@mysten/sui/.
const candidates = [
  resolve(__dirname, '../../@mysten/sui/dist/client/index.mjs'),      // installed
  resolve(__dirname, '../node_modules/@mysten/sui/dist/client/index.mjs'), // source
]

const target = candidates.find(existsSync) ?? null

if (!target) {
  console.log('[routex] patch-sui-compat: @mysten/sui not found, skipping.')
  process.exit(0)
}

const marker = '// routex-compat-patch'
const current = readFileSync(target, 'utf8')

if (current.includes(marker)) {
  // already patched
  process.exit(0)
}

const patch = `
${marker}
// Re-export v1 API names that Cetus SDK expects from @mysten/sui/client
export { SuiJsonRpcClient as SuiClient } from '../jsonRpc/index.mjs';
export { getJsonRpcFullnodeUrl as getFullnodeUrl } from '../jsonRpc/index.mjs';
`

writeFileSync(target, current + patch, 'utf8')
console.log('[routex] patch-sui-compat: applied @mysten/sui v1 compat shim to dist/client/index.mjs')
