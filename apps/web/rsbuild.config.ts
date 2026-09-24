import { defineConfig } from '@rsbuild/core'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'
import { beastOctane } from 'beast-tsrx/rsbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  context: root,
  source: { entry: { index: './src/main.ts' } },
  resolve: {
    extensions: ['.btsx', '.ts', '.tsx', '.tsrx', '.js', '.json'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  html: { template: './index.html' },
  plugins: [pluginTailwindcss(), ...beastOctane()]
})
