import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Config, RegistryItem } from '@beast-ui/registry/schema'
import { relativePathSchema } from '@beast-ui/registry/schema'
import { safePath, readOptional } from '@beast-ui/registry/node'
import { readConfig } from '../utils/config.ts'
import { resolveItems } from '../utils/registry.ts'

export interface AddOptions {
  cwd: string
  registry?: string
  dryRun?: boolean
  overwrite?: boolean
  skipInstall?: boolean
}

export async function planFiles(cwd: string, config: Config, items: RegistryItem[], overwrite = false) {
  const plan = new Map<string, { path: string; content: string; exists: boolean }>()
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
      if (existing !== undefined && existing !== content && !overwrite) throw new Error(`File already exists: ${relative}. Use --overwrite to replace it.`)
      if (existing !== content) plan.set(target, { path: relative, content, exists: existing !== undefined })
    }
  }
  return [...plan.values()]
}

export function installDependencies(cwd: string, manager: Config['packageManager'], dependencies: string[]): Promise<void> {
  if (!dependencies.length) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const child = spawn(manager, [manager === 'npm' ? 'install' : 'add', ...dependencies], { cwd, stdio: 'inherit', shell: false })
    child.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT'
      ? new Error(`Could not run ${manager}. Install it, or rerun with --skip-install and install the dependencies yourself.`)
      : error))
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${manager} exited with code ${code}`)))
  })
}

export async function addComponents(names: string[], options: AddOptions) {
  if (await readOptional(path.join(options.cwd, 'package.json')) === undefined) throw new Error('Target project is missing package.json.')
  const config = await readConfig(options.cwd)
  const items = await resolveItems(options.registry ?? config.registry, names)
  const files = await planFiles(options.cwd, config, items, options.overwrite)
  const dependencies = [...new Set(items.flatMap((item) => item.dependencies))].sort()
  console.log(`Items: ${items.map((item) => item.name).join(', ')}`)
  for (const file of files) console.log(`${file.exists ? 'Replace' : 'Create'} ${file.path}`)
  if (!files.length) console.log('All source files are already up to date.')
  if (dependencies.length) console.log(`Dependencies: ${dependencies.join(' ')}`)
  if (options.dryRun) return { files, dependencies }
  if (!options.skipInstall) await installDependencies(options.cwd, config.packageManager, dependencies)
  for (const file of files) {
    const target = await safePath(options.cwd, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: options.overwrite ? 'w' : 'wx' })
  }
  console.log(`Added ${names.join(', ')}.`)
  if (options.skipInstall && dependencies.length) console.log(`Install the listed dependencies with ${config.packageManager} before building.`)
  if (items.some((item) => item.name === 'theme')) console.log(`Import ${config.paths.styles}/theme.css after @import "tailwindcss" in your app stylesheet.`)
  return { files, dependencies }
}
