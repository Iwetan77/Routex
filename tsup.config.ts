import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@mysten/sui', '@mysten/deepbook-v3', '@cetusprotocol/cetus-sui-clmm-sdk', 'aftermath-ts-sdk'],
})
