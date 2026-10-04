import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { safePath, readOptional } from '@beast-ui/registry/node'
import { tableAssets } from '../table-assets.ts'
import { installDependencies } from './add.ts'
import type { Config } from '@beast-ui/registry/schema'

export interface TableInitOptions {
  cwd: string
  /** Isolated source directory. All component imports are relative. */
  path?: string
  /** Tailwind v4 entry stylesheet; detected when exactly one common entry exists. */
  css?: string
  packageManager?: Config['packageManager']
  dryRun?: boolean
  skipInstall?: boolean
  log?: (line: string) => void
  install?: typeof installDependencies
}
export interface TableSetupFile { path: string; content: string; status: 'create' | 'keep' | 'update' | 'conflict' }

const bindings = ['@octanejs/base-ui', '@octanejs/cmdk', '@octanejs/day-picker', '@octanejs/dnd-kit', '@octanejs/nuqs', '@octanejs/select', '@octanejs/tanstack-table'] as const
// Each adapter series declares a matching Octane peer. Pin releases so future
// minor adapters cannot silently switch the consuming project's runtime series.
const versions = {
  '2': ['0.1.53', '0.1.37', '0.0.19', '0.1.47', '0.1.41', '0.1.3', '0.1.51'],
  '3': ['0.1.54', '0.1.38', '0.0.20', '0.1.48', '0.1.42', '0.1.4', '0.1.53'],
  '4': ['0.1.55', '0.1.39', '0.0.21', '0.1.49', '0.1.43', '0.1.5', '0.1.54'],
  '8': ['0.1.59', '0.1.43', '0.0.25', '0.1.53', '0.1.47', '0.1.9', '0.1.58'],
} as const

export async function initTable(options: TableInitOptions): Promise<TableSetupFile[]> {
  const cwd = path.resolve(options.cwd)
  const directory = options.path ?? 'src/components/table'
  // Validate the directory even if the bundle were empty.
  await safePath(cwd, directory)
  const log = options.log ?? console.log
  const packagePath = await safePath(cwd, 'package.json')
  const original = await readOptional(packagePath)
  if (original === undefined) throw new Error('Target project is missing package.json.')
  const manifest = JSON.parse(original)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('package.json must contain an object.')
  for (const key of ['dependencies', 'devDependencies']) {
    if (manifest[key] !== undefined && (!manifest[key] || typeof manifest[key] !== 'object' || Array.isArray(manifest[key]))) throw new Error(`package.json ${key} must be an object.`)
  }
  const declaredRuntime = manifest.dependencies?.octane ?? manifest.devDependencies?.octane
  if (typeof declaredRuntime !== 'string') throw new Error('table init needs an existing Beast + Octane project. Install octane and configure Beast first.')
  // Resolve the installed version for workspace/file/range declarations too.
  const runtimePackage = await readOptional(path.join(cwd, 'node_modules/octane/package.json'))
  const runtime = runtimePackage ? JSON.parse(runtimePackage).version : declaredRuntime
  const series = /^[~^]?0\.(2|3|4|8)\./.exec(runtime)?.[1] as keyof typeof versions | undefined
  if (!series) throw new Error(`Unsupported Octane version ${runtime}. Table supports Octane 0.2.x, 0.3.x, 0.4.x, and 0.8.x; install your project's Octane dependency before retrying a workspace or complex range.`)
  const dependencies: Record<string, string> = { ...tableAssets.dependencies }
  bindings.forEach((name, index) => { dependencies[name] = versions[series][index] })

  let manager = options.packageManager ?? 'bun'
  if (!options.packageManager) {
    for (const [lockfile, name] of [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm']] as const) {
      if (await readOptional(await safePath(cwd, lockfile)) !== undefined) { manager = name; break }
    }
  }
  let stylesheet = options.css
  if (!stylesheet) {
    const candidates: string[] = []
    for (const candidate of ['src/style.css', 'src/styles.css', 'src/index.css', 'src/app.css', 'src/styles/globals.css']) {
      const content = await readOptional(await safePath(cwd, candidate))
      if (content !== undefined && /@import\s+["']tailwindcss(?:["'/])/.test(content)) candidates.push(candidate)
    }
    if (candidates.length !== 1) throw new Error('Could not identify one Tailwind v4 entry stylesheet. Pass --css <project-relative-path>. No files were changed.')
    stylesheet = candidates[0]
  }
  const stylesheetPath = await safePath(cwd, stylesheet!)
  const css = await readOptional(stylesheetPath)
  if (css === undefined || !/@import\s+["']tailwindcss(?:["'/])/.test(css)) throw new Error(`${stylesheet} must be an existing Tailwind v4 entry stylesheet with @import "tailwindcss".`)
  const files: TableSetupFile[] = []
  for (const [relative, source] of Object.entries(tableAssets.files)) {
    const content = relative === 'table.css' ? source : source
    const target = `${directory}/${relative}`
    if (target === stylesheet || target === 'package.json') throw new Error(`Table source conflicts with setup file: ${target}`)
    const existing = await readOptional(await safePath(cwd, target))
    files.push({ path: target, content, status: existing === undefined ? 'create' : existing === content ? 'keep' : 'conflict' })
  }
  const cssImport = path.relative(path.dirname(stylesheet!), path.join(directory, 'table.css')).split(path.sep).join('/')
  const specifier = cssImport.startsWith('.') ? cssImport : `./${cssImport}`
  const present = [...css.matchAll(/@import\s+["']([^"']+)["']/g)].some(match => path.posix.normalize(match[1]) === path.posix.normalize(specifier))
  // Keep every @import ahead of style rules. Tailwind resolves the feature's
  // @theme and @source in the same stylesheet pass as the host's utilities.
  files.push({ path: stylesheet!, content: present ? css : `@import ${JSON.stringify(specifier)};\n${css}`, status: present ? 'keep' : 'update' })
  const install = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`)
  log(`Table setup (Octane 0.${series}.x)`)
  for (const file of files) log(`  ${file.status}: ${file.path}`)
  for (const dependency of install) log(`  dependency: ${dependency}`)
  log(`  install with: ${manager}${options.skipInstall ? ' (skipped)' : ''}`)
  const conflicts = files.filter(file => file.status === 'conflict')
  if (conflicts.length) {
    log(`Conflicts (preserved): ${conflicts.map(file => file.path).join(', ')}`)
    if (!options.dryRun) throw new Error('Table setup has conflicts. No files were changed. Resolve the listed conflicts before rerunning.')
  }
  if (options.dryRun) { log('Dry run: no files or dependencies were changed.'); return files }
  // Finish preflight before either installation or file writes.
  if (!options.skipInstall) await (options.install ?? installDependencies)(cwd, manager, install)
  for (const file of files) {
    if (file.status === 'keep') continue
    const target = await safePath(cwd, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: file.status === 'create' ? 'wx' : 'w' })
  }
  log(`Table ready. Import Table from './${directory}/table.btsx' (adjust relative to your component).`)
  if (options.skipInstall) log(`Install the dependencies listed above before building. Octane ${runtime} was preserved.`)
  return files
}
