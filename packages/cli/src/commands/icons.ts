import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { safePath, readOptional } from '@beast-ui/registry/node'
import { iconAssets } from '../icon-assets.ts'

const { builder, beastIcon, beastTypes, beastIndex, reactIcon, reactTypes, initialIcons, search, menu, close, arrow } = iconAssets

export interface IconsInitOptions {
  cwd: string
  framework?: 'beast' | 'react'
  dryRun?: boolean
  /** Injectable process runner for tests; production always uses real commands. */
  run?: (command: string, args: string[], cwd: string) => Promise<void>
  log?: (line: string) => void
}

export interface IconSetupFile {
  path: string
  content: string
  status: 'create' | 'keep' | 'conflict'
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false })
    child.once('error', error => reject(new Error(`Could not run ${command}: ${error.message}. Install Bun and rerun icons init.`)))
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed (${code}). Fix the error and rerun icons init.`)))
  })
}

/** Preflight the entire setup before modifying the project. Conflicts are never overwritten. */
export async function initIcons(options: IconsInitOptions): Promise<IconSetupFile[]> {
  const cwd = path.resolve(options.cwd)
  const framework = options.framework ?? 'beast'
  if (framework !== 'beast' && framework !== 'react') throw new Error(`Unsupported framework: ${framework}`)
  const log = options.log ?? console.log
  const packagePath = await safePath(cwd, 'package.json')
  const original = await readOptional(packagePath)
  if (original === undefined) throw new Error('Target project is missing package.json.')
  const manifest = JSON.parse(original)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('package.json must contain an object.')
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    if (manifest[key] !== undefined && (!manifest[key] || typeof manifest[key] !== 'object' || Array.isArray(manifest[key]))) {
      throw new Error(`package.json ${key} must be an object.`)
    }
  }
  const scripts = {
    'icons:build': 'bun scripts/build-icons.ts --svg src/lib/icons/svg --out src/lib/icons/icons.ts',
    'icons:check': 'bun scripts/build-icons.ts --svg src/lib/icons/svg --out src/lib/icons/icons.ts --check',
  }
  const conflicts: string[] = []
  for (const [key, value] of Object.entries(scripts)) {
    if (manifest.scripts?.[key] !== undefined && manifest.scripts[key] !== value) conflicts.push(`package.json scripts.${key}`)
  }
  const contents: Record<string, string> = {
    'scripts/build-icons.ts': builder,
    [`src/lib/icons/Icon.${framework === 'beast' ? 'btsx' : 'tsx'}`]: framework === 'beast' ? beastIcon : reactIcon,
    'src/lib/icons/types.ts': framework === 'beast' ? beastTypes : reactTypes,
    'src/lib/icons/index.ts': framework === 'beast' ? beastIndex : beastIndex.replace('./Icon.btsx', './Icon'),
    'src/lib/icons/svg/search.svg': search,
    'src/lib/icons/svg/menu.svg': menu,
    'src/lib/icons/svg/close.svg': close,
    'src/lib/icons/svg/arrow-right.svg': arrow,
    'src/lib/icons/icons.ts': initialIcons,
  }
  const files: IconSetupFile[] = []
  for (const [relative, content] of Object.entries(contents)) {
    const existing = await readOptional(await safePath(cwd, relative))
    const status = existing === undefined ? 'create' : existing === content ? 'keep' : 'conflict'
    files.push({ path: relative, content, status })
    if (status === 'conflict') conflicts.push(relative)
  }
  // A legacy index.tsx or opposite-framework component would make imports ambiguous.
  for (const relative of ['src/lib/icons/index.tsx', `src/lib/icons/Icon.${framework === 'beast' ? 'tsx' : 'btsx'}`]) {
    if (await readOptional(await safePath(cwd, relative)) !== undefined) conflicts.push(relative)
  }
  // Check the empty color directory too, including symlink ancestors.
  const colorPath = await safePath(cwd, 'src/lib/icons/svg/color')
  const colorInfo = await stat(colorPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
  if (colorInfo && !colorInfo.isDirectory()) conflicts.push('src/lib/icons/svg/color (expected directory)')
  const installed = manifest.devDependencies?.svgo ?? manifest.dependencies?.svgo
  log(`Icons setup (${framework})`)
  for (const file of files) log(`  ${file.status}: ${file.path}`)
  log('  directory: src/lib/icons/svg/color/')
  for (const [key, value] of Object.entries(scripts)) log(`  script: ${key} = ${value}`)
  log(`  dependency: svgo (${installed ?? '^4.1.0'}, dev dependency)`)
  log('  run: bun --version')
  log(`  run: bun add --dev svgo@${installed ?? '^4.1.0'}`)
  log('  run: bun run icons:build')
  if (conflicts.length) {
    log(`Conflicts (preserved): ${conflicts.join(', ')}`)
    if (!options.dryRun) throw new Error('Icons setup has conflicts. No files were changed. Resolve the listed conflicts before rerunning.')
  }
  if (options.dryRun) {
    log('Dry run: no files, dependencies, or scripts were changed.')
    return files
  }
  const run = options.run ?? runCommand
  // Check Bun before writing any files.
  await run('bun', ['--version'], cwd)
  for (const file of files.filter(file => file.status === 'create')) {
    const target = await safePath(cwd, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: 'wx' })
  }
  await mkdir(colorPath, { recursive: true })
  manifest.scripts = { ...manifest.scripts, ...scripts }
  const updated = JSON.stringify(manifest, null, 2) + '\n'
  if (updated !== original) await writeFile(packagePath, updated)
  await run('bun', ['add', '--dev', installed ? `svgo@${installed}` : 'svgo@^4.1.0'], cwd)
  await run('bun', ['run', 'icons:build'], cwd)
  log("Icons ready. Import { Icon } from '@/lib/icons', add SVGs, and run bun run icons:build.")
  return files
}
