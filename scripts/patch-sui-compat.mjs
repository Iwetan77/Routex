/**
 * Post-install compatibility shims for @mysten/sui v2 + Cetus SDK v5.
 *
 * Two patches are applied:
 *
 * (1) `@mysten/sui/client` barrel — re-export `SuiClient` / `getFullnodeUrl`.
 *     Cetus SDK v5 imports these from `@mysten/sui/client` (v1 location); in
 *     v2 they moved to `@mysten/sui/jsonRpc` and were renamed. Without this
 *     re-export, importing the Cetus SDK throws at module load.
 *
 * (2) `@mysten/sui/dist/client/mvr.mjs` — make `hasMvrName` tolerate undefined
 *     input. Cetus SDK's preswap pipeline builds a Transaction with struct
 *     tags whose `address` field can be undefined for non-MVR types. The
 *     NamedPackagesPlugin then calls `hasMvrName(tag.address)` which crashes
 *     on `undefined.includes(...)`, killing every preswap call with a
 *     "Cannot read properties of undefined (reading 'includes')" TypeError.
 *     Patching `hasMvrName` to return false for non-string input is the
 *     correct defensive guard — the original code clearly expects a string.
 *
 * Both patches are idempotent (skip if already applied).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Patch 1: client barrel re-exports ────────────────────────────────────

const clientCandidates = [
  resolve(__dirname, '../../@mysten/sui/dist/client/index.mjs'),
  resolve(__dirname, '../node_modules/@mysten/sui/dist/client/index.mjs'),
]

const clientTarget = clientCandidates.find(existsSync) ?? null

if (!clientTarget) {
  console.log('[routex] patch-sui-compat: @mysten/sui not found, skipping.')
  process.exit(0)
}

{
  const marker  = '// routex-compat-patch'
  const current = readFileSync(clientTarget, 'utf8')

  let cleaned = current
  if (cleaned.includes(marker)) {
    cleaned = cleaned.slice(0, cleaned.indexOf(marker)).trimEnd() + '\n'
  }

  const lines = []
  if (!cleaned.includes('as SuiClient')) {
    lines.push("export { SuiJsonRpcClient as SuiClient } from '../jsonRpc/index.mjs';")
  }
  if (!cleaned.includes('as getFullnodeUrl')) {
    lines.push("export { getJsonRpcFullnodeUrl as getFullnodeUrl } from '../jsonRpc/index.mjs';")
  }

  if (lines.length === 0) {
    if (cleaned !== current) {
      writeFileSync(clientTarget, cleaned, 'utf8')
      console.log('[routex] patch-sui-compat: removed stale client patch block')
    }
  } else {
    const patch = `\n${marker}\n${lines.join('\n')}\n`
    writeFileSync(clientTarget, cleaned + patch, 'utf8')
    console.log(`[routex] patch-sui-compat: added ${lines.length} re-export(s) to dist/client/index.mjs`)
  }
}

// ─── Patch 2: harden hasMvrName against undefined input ───────────────────

const mvrCandidates = [
  resolve(__dirname, '../../@mysten/sui/dist/client/mvr.mjs'),
  resolve(__dirname, '../node_modules/@mysten/sui/dist/client/mvr.mjs'),
]

const mvrTarget = mvrCandidates.find(existsSync) ?? null

if (mvrTarget) {
  const marker  = '/* routex-mvr-patch */'
  const current = readFileSync(mvrTarget, 'utf8')

  if (current.includes(marker)) {
    // Already patched — done.
  } else {
    const original = 'function hasMvrName(nameOrType) {\n\treturn nameOrType.includes('
    const replacement =
      'function hasMvrName(nameOrType) { /* routex-mvr-patch */\n' +
      '\tif (typeof nameOrType !== "string") return false;\n' +
      '\treturn nameOrType.includes('

    if (current.includes(original)) {
      writeFileSync(mvrTarget, current.replace(original, replacement), 'utf8')
      console.log('[routex] patch-sui-compat: hardened hasMvrName in dist/client/mvr.mjs')
    } else {
      // Source shape changed — log so a future maintainer notices.
      console.log('[routex] patch-sui-compat: mvr.mjs shape unexpected, hasMvrName not patched.')
    }
  }
}
