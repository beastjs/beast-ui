#!/usr/bin/env node
import path from 'node:path'
import { Command, Option } from 'commander'
import type { Config } from '@beast-ui/registry/schema'
import packageJson from '../package.json' with { type: 'json' }
import { addComponents } from './commands/add.ts'
import { DEFAULT_REGISTRY, findConfig, initConfig } from './utils/config.ts'
import { fetchCatalog } from './utils/registry.ts'

interface InitOptions { cwd: string; registry: string; packageManager?: Config['packageManager'] }
interface ListOptions { cwd: string; registry?: string }
interface AddCommandOptions { cwd: string; registry?: string; dryRun?: boolean; overwrite?: boolean; skipInstall?: boolean }

const program = new Command()
  .name('beast-ui')
  .description('Install Beast UI source components into a Beast + Octane project')
  .version(packageJson.version)

program.command('init')
  .description('Create beast-ui.json in an existing Beast project')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Registry directory URL', DEFAULT_REGISTRY)
  .addOption(new Option('--package-manager <name>', 'Package manager (detected from lockfile by default)').choices(['bun', 'npm', 'pnpm', 'yarn']))
  .action(async (options: InitOptions) => {
    await initConfig(path.resolve(options.cwd), options.registry, options.packageManager)
    console.log('Created beast-ui.json. Check paths and aliases, then run add button.')
    console.log('Requires Beast + Octane, Tailwind CSS v4, and a matching TypeScript/Vite @/* alias to src/*.')
  })

program.command('list')
  .description('List available registry items')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Override the configured registry URL')
  .action(async (options: ListOptions) => {
    const registry = options.registry ?? (await findConfig(path.resolve(options.cwd)))?.registry ?? DEFAULT_REGISTRY
    const catalog = await fetchCatalog(registry)
    for (const item of catalog.items) console.log(`${item.name.padEnd(16)} ${item.description ?? item.type}`)
  })

program.command('add')
  .description('Add components and their registry dependencies')
  .argument('<components...>', 'Registry item names')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Override the configured registry URL')
  .option('--dry-run', 'Show files and dependencies without writing or installing')
  .option('--overwrite', 'Replace differing existing component files')
  .option('--skip-install', 'Copy source files without installing npm dependencies')
  .action(async (names: string[], options: AddCommandOptions) => { await addComponents(names, { ...options, cwd: path.resolve(options.cwd) }) })

try {
  await program.parseAsync()
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
