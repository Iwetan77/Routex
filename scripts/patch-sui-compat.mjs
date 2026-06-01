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
 * It is idempotent: checks for existing exports before patching to avoid
 * "Duplicate export" errors when @mysten/sui v2 later added these back itself.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const candidates = [
  resolve(__dirname, '../../@mysten/sui/dist/client/index.mjs'),
  resolve(__dirname, '../node_modules/@mysten/sui/dist/client/index.mjs'),
]

const target = candidates.find(existsSync) ?? null

if (!target) {
  console.log('[routex] patch-sui-compat: @mysten/sui not found, skipping.')
  process.exit(0)
}

const marker  = '// routex-compat-patch'
const current = readFileSync(target, 'utf8')

// Remove any previous (possibly broken) patch block so we start clean
let cleaned = current
if (cleaned.includes(marker)) {
  // Strip everything from the marker to end of file, then trim trailing whitespace
  cleaned = cleaned.slice(0, cleaned.indexOf(marker)).trimEnd() + '\n'
}

// Only add re-exports that are not already present in the file
const lines = []

if (!cleaned.includes("as SuiClient")) {
  lines.push("export { SuiJsonRpcClient as SuiClient } from '../jsonRpc/index.mjs';")
}
if (!cleaned.includes("as getFullnodeUrl")) {
  lines.push("export { getJsonRpcFullnodeUrl as getFullnodeUrl } from '../jsonRpc/index.mjs';")
}

if (lines.length === 0) {
  // Nothing to add — write cleaned content back (removes stale patch block if any)
  if (cleaned !== current) {
    writeFileSync(target, cleaned, 'utf8')
    console.log('[routex] patch-sui-compat: removed stale patch block (all symbols already exported)')
  }
  process.exit(0)
}

const patch = `\n${marker}\n${lines.join('\n')}\n`
writeFileSync(target, cleaned + patch, 'utf8')
console.log(`[routex] patch-sui-compat: added ${lines.length} compat re-export(s) to dist/client/index.mjs`)
