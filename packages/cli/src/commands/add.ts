import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Config, RegistryItem } from '@beast-ui/registry/schema'
import { relativePathSchema } from '@beast-ui/registry/schema'
import { safePath, readOptional } from '@beast-ui/registry/node'
import { DEFAULT_REGISTRY, findConfig, initConfig } from '../utils/config.ts'
import { resolveItems } from '../utils/registry.ts'
import { paint, splitDependency, symbols, terminalReporter, type Reporter } from '../utils/ui.ts'

export interface AddOptions {
  cwd: string
  registry?: string
  dryRun?: boolean
  overwrite?: boolean
  skipInstall?: boolean
  /** Create beast-ui.json without asking when it is missing. */
  yes?: boolean
  reporter?: Reporter
}

export type FileStatus = 'create' | 'replace' | 'keep'

export interface PlannedFile {
  path: string
  content: string
  status: FileStatus
  /** Why a kept file is left alone. */
  reason?: 'identical' | 'contains'
}

export interface AddResult {
  files: PlannedFile[]
  kept: PlannedFile[]
  dependencies: string[]
  cancelled?: boolean
}

// Compare code, not formatting: quotes, semicolons, and whitespace may differ.
const normalizeCode = (source: string): string =>
  source.replace(/\r\n/g, '\n').replace(/'/g, '"').replace(/;\s*$/gm, '').replace(/\s+/g, ' ').trim()

export async function planFiles(cwd: string, config: Config, items: RegistryItem[], overwrite = false): Promise<PlannedFile[]> {
  const plan = new Map<string, PlannedFile>()
  const destinations = new Map<string, string>()
  for (const item of items) {
    for (const file of item.files) {
      if (file.content === undefined) throw new Error(`Missing file content: ${file.path}`)
      const kind = file.type === 'registry:ui' ? 'ui' : file.type === 'registry:lib' ? 'lib' : 'styles'
      const dir = config.paths[kind]
      const sourcePath = relativePathSchema.parse(file.path)
      // Strip only documented source roots; preserve the tree beneath them.
      const prefix = [`packages/registry/${kind}/`, `${kind}/`].find((value) => sourcePath.startsWith(value))
      const filename = prefix ? sourcePath.slice(prefix.length) : sourcePath
      const extension = path.extname(filename)
      const allowed = file.type === 'registry:ui' ? ['.btsx'] : file.type === 'registry:lib' ? ['.ts'] : ['.css']
      if (!allowed.includes(extension)) throw new Error(`Unsupported ${file.type} file: ${filename}`)
      const relative = `${dir}/${filename}`
      const target = await safePath(cwd, relative)
      const content = file.content.replaceAll('@/lib/utils', config.aliases.utils)
      const previous = destinations.get(target)
      if (previous !== undefined && previous !== content) throw new Error(`Registry items conflict at ${relative}`)
      destinations.set(target, content)
      const existing = await readOptional(target)
      if (existing === undefined) {
        plan.set(target, { path: relative, content, status: 'create' })
      } else if (existing === content) {
        plan.set(target, { path: relative, content, status: 'keep', reason: 'identical' })
      } else if (normalizeCode(existing).includes(normalizeCode(content))) {
        plan.set(target, { path: relative, content, status: 'keep', reason: 'contains' })
      } else if (overwrite) {
        plan.set(target, { path: relative, content, status: 'replace' })
      } else {
        throw new Error(`${relative} already exists with different code. Rerun with --overwrite to replace it.`)
      }
    }
  }
  return [...plan.values()]
}

export function installDependencies(cwd: string, manager: Config['packageManager'], dependencies: string[]): Promise<void> {
  if (!dependencies.length) return Promise.resolve()
  return new Promise((resolve, reject) => {
    // Capture output so the spinner stays clean; show it only when the install fails.
    const child = spawn(manager, [manager === 'npm' ? 'install' : 'add', ...dependencies], { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    const output: string[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT'
      ? new Error(`Could not run ${manager}. Install it, or rerun with --skip-install and install the dependencies yourself.`)
      : error))
    child.once('close', (code) => {
      if (code === 0) return resolve()
      const tail = output.join('').trim().split('\n').slice(-15).join('\n')
      reject(new Error(`${manager} exited with code ${code}${tail ? `\n\n${tail}` : ''}`))
    })
  })
}

async function ensureConfig(options: AddOptions, reporter: Reporter, names: string[]): Promise<Config | undefined> {
  const existing = await findConfig(options.cwd)
  if (existing) return existing
  if (!options.yes) {
    if (!reporter.confirm) throw new Error(`No beast-ui.json in ${options.cwd}. Run beast-ui init first, or pass --yes to create it.`)
    const accepted = await reporter.confirm(`No beast-ui.json here. Initialize it and add ${names.join(', ')}?`, true)
    if (!accepted) return undefined
  }
  const config = await initConfig(options.cwd, options.registry ?? DEFAULT_REGISTRY)
  const registry = config.registry === DEFAULT_REGISTRY ? 'hosted registry' : config.registry
  reporter.line(`  ${paint('green', symbols.ok)} Created beast-ui.json ${paint('dim', `${config.packageManager} · ${config.paths.ui} · ${registry}`)}`)
  reporter.line()
  return config
}

function printPlan(reporter: Reporter, files: PlannedFile[], dependencies: string[]): void {
  const width = Math.max(...files.map((file) => file.path.length))
  reporter.line(`  ${paint('bold', 'Files')}`)
  for (const file of files) {
    const mark = file.status === 'create' ? paint('green', symbols.create) : file.status === 'replace' ? paint('yellow', symbols.replace) : paint('dim', symbols.keep)
    const note = file.status === 'replace' ? 'replace'
      : file.reason === 'contains' ? 'already contains this code'
      : file.reason === 'identical' ? 'up to date' : ''
    const name = file.status === 'keep' ? paint('dim', file.path) : file.path
    reporter.line(`    ${mark} ${name}${note ? `${' '.repeat(width - file.path.length + 2)}${paint('dim', note)}` : ''}`)
  }
  if (dependencies.length) {
    const parts = dependencies.map(splitDependency)
    const nameWidth = Math.max(...parts.map((part) => part.name.length))
    reporter.line()
    reporter.line(`  ${paint('bold', 'Dependencies')}`)
    for (const { name, range } of parts) reporter.line(`    ${paint('cyan', symbols.item)} ${name.padEnd(nameWidth + 2)}${paint('dim', range)}`)
  }
  reporter.line()
}

export async function addComponents(names: string[], options: AddOptions): Promise<AddResult> {
  const reporter = options.reporter ?? terminalReporter()
  if (await readOptional(path.join(options.cwd, 'package.json')) === undefined) throw new Error('Target project is missing package.json.')
  reporter.line()
  reporter.line(`  ${paint('magenta', symbols.brand)} ${paint('bold', 'beast-ui')} ${paint('dim', `add ${names.join(' ')}`)}`)
  reporter.line()

  const config = await ensureConfig(options, reporter, names)
  if (!config) {
    reporter.line(`  ${paint('dim', 'Nothing changed.')}`)
    return { files: [], kept: [], dependencies: [], cancelled: true }
  }
  const items = await resolveItems(options.registry ?? config.registry, names)
  const planned = await planFiles(options.cwd, config, items, options.overwrite)
  const files = planned.filter((file) => file.status !== 'keep')
  const kept = planned.filter((file) => file.status === 'keep')
  const dependencies = [...new Set(items.flatMap((item) => item.dependencies))].sort()
  printPlan(reporter, planned, dependencies)

  if (options.dryRun) {
    reporter.line(`  ${paint('dim', 'Dry run: nothing was written or installed.')}`)
    return { files, kept, dependencies }
  }

  if (dependencies.length && !options.skipInstall) {
    const count = `${dependencies.length} ${dependencies.length === 1 ? 'package' : 'packages'}`
    const task = reporter.task(`Installing ${count} with ${config.packageManager}`)
    try {
      await installDependencies(options.cwd, config.packageManager, dependencies)
      task.done(`Installed ${count} with ${config.packageManager}`)
    } catch (error) {
      task.fail(`Could not install with ${config.packageManager}`)
      throw error
    }
  }
  for (const file of files) {
    const target = await safePath(options.cwd, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: file.status === 'replace' ? 'w' : 'wx' })
  }
  if (files.length) reporter.line(`  ${paint('green', symbols.ok)} Wrote ${files.length} ${files.length === 1 ? 'file' : 'files'}`)

  reporter.line()
  reporter.line(`  ${paint('green', symbols.brand)} ${paint('bold', `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} ready.`)}`)
  if (options.skipInstall && dependencies.length) reporter.line(`    ${paint('dim', `Install the dependencies above with ${config.packageManager} before building.`)}`)
  if (files.some((file) => file.status === 'create' && file.path.endsWith('/theme.css'))) reporter.line(`    ${paint('dim', `Import ${config.paths.styles}/theme.css after @import "tailwindcss" in your stylesheet.`)}`)
  reporter.line()
  return { files, kept, dependencies }
}
