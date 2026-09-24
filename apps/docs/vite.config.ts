import { cp, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { beastOctane } from 'beast-tsrx/vite'
import { defineConfig, type Connect, type Plugin } from 'vite'

// The registry is built for the Cloudflare Worker in apps/registry. Serve the
// same files at /r so local installs and "View source JSON" links keep working.
const registryOutput = fileURLToPath(new URL('../registry/public/r/', import.meta.url))

function registry(): Plugin {
  let outDir = ''
  const serve: Connect.NextHandleFunction = async (request, response, next) => {
    const name = path.posix.basename(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (!/^[a-z0-9-]+\.json$/.test(name)) return next()
    try {
      const body = await readFile(path.join(registryOutput, name))
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.end(body)
    } catch {
      // A 404 rather than the SPA fallback, so the CLI can name the unknown item.
      response.statusCode = 404
      response.end()
    }
  }
  return {
    name: 'beast-ui-registry',
    configResolved: (config) => { outDir = path.resolve(config.root, config.build.outDir) },
    configureServer: (server) => { server.middlewares.use('/r', serve) },
    configurePreviewServer: (server) => { server.middlewares.use('/r', serve) },
    async closeBundle() {
      if (outDir) await cp(registryOutput, path.join(outDir, 'r'), { recursive: true })
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/', import.meta.url))
    }
  },
  plugins: [tailwindcss(), beastOctane(), registry()]
})
