import { afterEach, describe, expect, test } from 'bun:test'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertContainedImports, buildRegistry } from '../scripts/build-registry.ts'
import { addComponents, installDependencies, planFiles } from '../packages/cli/src/commands/add.ts'
import { DEFAULT_REGISTRY, initConfig, readConfig } from '../packages/cli/src/utils/config.ts'
import { fetchComponent, resolveItems } from '../packages/cli/src/utils/registry.ts'
import { registryItemSchema, type RegistryItem } from '@beast-ui/registry/schema'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function temp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beast-ui-test-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}
async function project() {
  const dir = await temp()
  await writeFile(path.join(dir, 'package.json'), '{"name":"fixture","private":true}')
  return dir
}
function server(handler: (request: Request) => Response | Promise<Response>) {
  const instance = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handler })
  cleanup.push(() => { instance.stop(true) })
  return `http://127.0.0.1:${instance.port}/r`
}
async function registryServer() {
  const output = path.join(await temp(), 'r')
  await buildRegistry(root, output)
  return server(async (request) => {
    const name = path.posix.basename(new URL(request.url).pathname)
    const file = Bun.file(path.join(output, name))
    return await file.exists() ? new Response(file, { headers: { 'Content-Type': 'application/json' } }) : new Response('Missing', { status: 404 })
  })
}
function item(name: string, dependencies: string[] = []): RegistryItem {
  return registryItemSchema.parse({ name, type: 'registry:lib', registryDependencies: dependencies, files: [{ path: `${name}.ts`, type: 'registry:lib', content: `export const ${name} = true` }] })
}

describe('registry distribution', () => {
  test('builds deterministic payloads with exact BTSX source and removes stale items', async () => {
    const output = path.join(await temp(), 'r')
    await buildRegistry(root, output)
    const before = await readFile(path.join(output, 'button.json'), 'utf8')
    const button = registryItemSchema.parse(JSON.parse(before))
    expect(button.files[0].content).toBe(await readFile(path.join(root, 'packages/registry/ui/button.btsx'), 'utf8'))
    expect(button.registryDependencies).toEqual(['utils', 'theme'])
    await writeFile(path.join(output, 'stale.json'), '{}')
    await buildRegistry(root, output)
    expect((await readdir(output)).sort()).toEqual(['button.json', 'call-chip.json', 'registry.json', 'scrubfield.json', 'squishy.json', 'theme.json', 'utils.json'])
    expect(await readFile(path.join(output, 'button.json'), 'utf8')).toBe(before)
  })

  test('installs both motion components with their shared dependency', async () => {
    const cwd = await project()
    await initConfig(cwd, await registryServer(), 'bun')
    const result = await addComponents(['scrubfield', 'squishy'], { cwd, skipInstall: true })
    expect(result.dependencies).toEqual(['@octanejs/motion@^0.1.53'])
    for (const name of ['scrubfield', 'squishy']) {
      expect(await readFile(path.join(cwd, `src/components/ui/${name}.btsx`), 'utf8'))
        .toBe(await readFile(path.join(root, `packages/registry/ui/${name}.btsx`), 'utf8'))
    }
  })

  test('installs call-chip with its icon dependency', async () => {
    const cwd = await project()
    await initConfig(cwd, await registryServer(), 'bun')
    const result = await addComponents(['call-chip'], { cwd, skipInstall: true })
    expect(result.dependencies).toEqual(['@hugeicons/core-free-icons@^4.3.5'])
    expect(await readFile(path.join(cwd, 'src/components/ui/call-chip.btsx'), 'utf8'))
      .toBe(await readFile(path.join(root, 'packages/registry/ui/call-chip.btsx'), 'utf8'))
  })

  test('installs over HTTP, rewrites utility imports, and is repeatable', async () => {
    const url = await registryServer()
    const cwd = await project()
    const config = await initConfig(cwd, url, 'bun')
    config.paths.lib = 'src/shared'
    config.aliases.utils = '~/shared/utils'
    await writeFile(path.join(cwd, 'beast-ui.json'), JSON.stringify(config))
    const options = { cwd, skipInstall: true }
    const dry = await addComponents(['button'], { ...options, dryRun: true })
    expect(dry.files).toHaveLength(3)
    expect((await readdir(cwd)).sort()).toEqual(['beast-ui.json', 'package.json'])
    const result = await addComponents(['button'], options)
    expect(result.dependencies).toContain('@octanejs/base-ui@0.1.53')
    expect(result.dependencies).toContain('clsx@^2.1.1')
    expect(await readFile(path.join(cwd, 'src/components/ui/button.btsx'), 'utf8')).toContain('from "~/shared/utils"')
    expect(await readFile(path.join(cwd, 'src/styles/theme.css'), 'utf8')).toContain('@theme inline')
    expect((await addComponents(['button'], options)).files).toHaveLength(0)
  })

  test('preflights all conflicts before writing and requires explicit overwrite', async () => {
    const cwd = await project()
    await initConfig(cwd, await registryServer(), 'bun')
    await mkdir(path.join(cwd, 'src/components/ui'), { recursive: true })
    const button = path.join(cwd, 'src/components/ui/button.btsx')
    await writeFile(button, 'local changes')
    await expect(addComponents(['button'], { cwd, skipInstall: true })).rejects.toThrow('File already exists')
    expect(await readFile(button, 'utf8')).toBe('local changes')
    expect(await Bun.file(path.join(cwd, 'src/lib/utils.ts')).exists()).toBe(false)
    await addComponents(['button'], { cwd, skipInstall: true, overwrite: true })
    expect(await readFile(button, 'utf8')).toContain('buttonVariants')
  })

  test.each(['packages/registry/lib/', 'lib/', ''])('preserves nested imports for source root %j', async (prefix) => {
    const nested = registryItemSchema.parse({
      name: 'nested', type: 'registry:lib', files: [
        { path: `${prefix}main.ts`, type: 'registry:lib', content: 'export { value } from "./internal/value.ts"' },
        { path: `${prefix}internal/value.ts`, type: 'registry:lib', content: 'export const value = 42' },
        { path: `${prefix}other/value.ts`, type: 'registry:lib', content: 'export const value = 99' },
      ],
    })
    const cwd = await project()
    const config = await initConfig(cwd, server(() => Response.json(nested)), 'bun')
    config.paths.lib = 'src/shared'
    await writeFile(path.join(cwd, 'beast-ui.json'), JSON.stringify(config))
    await addComponents(['nested'], { cwd, skipInstall: true })
    expect((await import(path.join(cwd, 'src/shared/main.ts'))).value).toBe(42)
    expect((await import(path.join(cwd, 'src/shared/other/value.ts'))).value).toBe(99)
    expect((await addComponents(['nested'], { cwd, skipInstall: true })).files).toHaveLength(0)
  })

  test('preflights nested conflicts and rejects nested symlinks', async () => {
    const cwd = await project()
    const nested = item('nested')
    nested.files[0].path = 'packages/registry/lib/internal/value.ts'
    const config = await initConfig(cwd, server(() => Response.json(nested)))
    await mkdir(path.join(cwd, 'src/lib/internal'), { recursive: true })
    await writeFile(path.join(cwd, 'src/lib/internal/value.ts'), 'local changes')
    await expect(addComponents(['nested'], { cwd, skipInstall: true })).rejects.toThrow('File already exists')
    await rm(path.join(cwd, 'src/lib/internal'), { recursive: true })
    await symlink(await temp(), path.join(cwd, 'src/lib/internal'))
    await expect(planFiles(cwd, config, [nested])).rejects.toThrow('symlink')
  })

  test('rejects traversal, symlink destinations, and conflicting registry files', async () => {
    const cwd = await project()
    const config = await initConfig(cwd, 'http://localhost:5173/r')
    config.paths.lib = '../outside'
    await expect(planFiles(cwd, config, [item('utils')])).rejects.toThrow('relative path')
    config.paths.lib = 'linked'
    await symlink(await temp(), path.join(cwd, 'linked'))
    await expect(planFiles(cwd, config, [item('utils')])).rejects.toThrow('symlink')
    config.paths.lib = 'src/lib'
    const a = item('utils')
    const b = item('other')
    b.files[0].path = 'utils.ts'
    await expect(planFiles(cwd, config, [a, b])).rejects.toThrow('conflict')
    expect(registryItemSchema.safeParse({ ...a, name: 'registry' }).success).toBe(false)
  })

  test('resolves shared dependencies once and reports cycles', async () => {
    const items = { a: item('a', ['shared']), b: item('b', ['shared']), shared: item('shared') }
    const url = server((request) => Response.json(items[path.posix.basename(new URL(request.url).pathname, '.json') as keyof typeof items]))
    expect((await resolveItems(url, ['a', 'b'])).map((value) => value.name)).toEqual(['shared', 'a', 'b'])
    items.shared.registryDependencies = ['a']
    await expect(resolveItems(url, ['a'])).rejects.toThrow('Circular')
  })

  test('reports missing items, malformed responses, name mismatch, and missing content', async () => {
    await expect(fetchComponent(server(() => new Response('', { status: 404 })), 'missing')).rejects.toThrow('Unknown registry item: missing')
    await expect(fetchComponent(server(() => new Response('', { status: 500 })), 'utils')).rejects.toThrow('Registry request failed (500)')
    const closed = server(() => new Response(''))
    await cleanup.pop()?.()
    await expect(fetchComponent(closed, 'utils')).rejects.toThrow('Could not reach the registry')
    await expect(fetchComponent(server(() => new Response('<html>')), 'utils')).rejects.toThrow('did not return JSON')
    await expect(fetchComponent(server(() => Response.json(item('other'))), 'utils')).rejects.toThrow('Expected registry item')
    const missingContent = item('utils')
    delete missingContent.files[0].content
    await expect(fetchComponent(server(() => Response.json(missingContent)), 'utils')).rejects.toThrow('Missing file content')
  })

  test('explains a missing package manager instead of surfacing ENOENT', async () => {
    const cwd = await project()
    const original = process.env.PATH
    process.env.PATH = await temp()
    cleanup.push(() => { process.env.PATH = original })
    await expect(installDependencies(cwd, 'pnpm', ['clsx@^2.1.1'])).rejects.toThrow('Could not run pnpm')
  })

  test('init defaults to the hosted registry', async () => {
    const cwd = await project()
    expect((await initConfig(cwd, undefined, 'bun')).registry).toBe(DEFAULT_REGISTRY)
    expect((await readConfig(cwd)).registry).toBe('https://beast-ui-registry.beastjs.workers.dev/r')
    await expect(readConfig(await project())).rejects.toThrow('Missing beast-ui.json. Run init first.')
  })

  test('init detects the package manager and preserves existing configuration', async () => {
    const cwd = await project()
    await writeFile(path.join(cwd, 'bun.lock'), '{}')
    await initConfig(cwd, 'http://localhost:5173/r')
    expect((await readConfig(cwd)).packageManager).toBe('bun')
    await expect(initConfig(cwd, 'http://localhost:9999/r')).rejects.toThrow('EEXIST')
    expect((await readConfig(cwd)).registry).toBe('http://localhost:5173/r')
  })

  test('rejects relative imports that leave their install root', async () => {
    const ui = (content: string) => ({ path: 'packages/registry/ui/button.btsx', type: 'registry:ui' as const, content })
    expect(() => assertContainedImports(ui('import { cn } from "../lib/utils"'))).toThrow('leaves the ui install root')
    expect(() => assertContainedImports(ui("const lazy = import('../lib/lazy.ts')"))).toThrow('leaves the ui install root')
    expect(() => assertContainedImports({ path: 'styles/theme.css', type: 'registry:style', content: '@import "../base.css";' })).toThrow('styles install root')
    expect(() => assertContainedImports(ui('import { cn } from "@/lib/utils"\nimport "./parts/icon.btsx"'))).not.toThrow()
    expect(() => assertContainedImports({ path: 'packages/registry/lib/internal/value.ts', type: 'registry:lib', content: 'export * from "../utils.ts"' })).not.toThrow()
    const cwd = await temp()
    await mkdir(path.join(cwd, 'ui'))
    await writeFile(path.join(cwd, 'ui/leak.btsx'), 'import { cn } from "../lib/utils"')
    const leak = { name: 'test', homepage: 'http://localhost', items: [{ name: 'leak', type: 'registry:ui', files: [{ path: 'ui/leak.btsx', type: 'registry:ui' }] }] }
    await writeFile(path.join(cwd, 'registry.json'), JSON.stringify(leak))
    await expect(buildRegistry(cwd, path.join(cwd, 'output'))).rejects.toThrow('leaves the ui install root')
  })

  test('invalid catalogs do not replace a previous build', async () => {
    const cwd = await temp()
    const output = path.join(cwd, 'output')
    await mkdir(output)
    await writeFile(path.join(output, 'existing.json'), 'keep')
    const broken = { name: 'test', homepage: 'http://localhost', items: [item('a', ['missing'])] }
    await writeFile(path.join(cwd, 'registry.json'), JSON.stringify(broken))
    await expect(buildRegistry(cwd, output)).rejects.toThrow('Unknown registry dependency')
    expect(await readFile(path.join(output, 'existing.json'), 'utf8')).toBe('keep')
  })
})

describe('published CLI', () => {
  test('packs without runtime dependencies and installs components under Node', async () => {
    const packs = await temp()
    await run('bun', ['pm', 'pack', '--destination', packs, '--quiet'], { cwd: path.join(root, 'packages/cli') })
    const [tarball] = await readdir(packs)
    const cwd = await project()
    await run('npm', ['install', '--offline', '--no-audit', '--no-fund', path.join(packs, tarball)], { cwd })
    const manifest = JSON.parse(await readFile(path.join(cwd, 'node_modules/@beast-ui/cli/package.json'), 'utf8'))
    expect(manifest.dependencies).toBeUndefined()
    expect(manifest.license).toBe('MIT')
    expect(await readFile(path.join(cwd, 'node_modules/@beast-ui/cli/LICENSE'), 'utf8')).toBe(await readFile(path.join(root, 'LICENSE'), 'utf8'))
    const cli = (args: string[]) => run('node', [path.join(cwd, 'node_modules/@beast-ui/cli/dist/index.js'), ...args], { cwd })
    expect((await cli(['--version'])).stdout.trim()).toBe(manifest.version)
    await cli(['init', '--registry', await registryServer(), '--package-manager', 'npm'])
    expect((await cli(['add', 'button', '--skip-install'])).stdout).toContain('Added button.')
    expect(await readFile(path.join(cwd, 'src/components/ui/button.btsx'), 'utf8')).toContain('from "@/lib/utils"')
    await expect(cli(['add', 'does-not-exist', '--skip-install'])).rejects.toMatchObject({ stderr: expect.stringContaining('Unknown registry item: does-not-exist') })
  }, 60_000)
})
