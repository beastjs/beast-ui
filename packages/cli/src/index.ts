#!/usr/bin/env node
import path from 'node:path'
import { Command, Option } from 'commander'
import { addComponents } from './commands/add.ts'
import { initConfig, readConfig } from './utils/config.ts'
import { fetchCatalog } from './utils/registry.ts'

const program = new Command()
  .name('beast-ui')
  .description('Install Beast UI source components into a Beast + Octane project')
  .version('0.0.0')

program.command('init')
  .description('Create beast-ui.json in an existing Beast project')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .requiredOption('-r, --registry <url>', 'Registry directory URL, e.g. http://localhost:5173/r')
  .addOption(new Option('--package-manager <name>', 'Package manager (detected from lockfile by default)').choices(['bun', 'npm', 'pnpm', 'yarn']))
  .action(async (options) => {
    await initConfig(path.resolve(options.cwd), options.registry, options.packageManager)
    console.log('Created beast-ui.json. Check paths and aliases, then run add button.')
    console.log('Requires Beast + Octane, Tailwind CSS v4, and a matching TypeScript/Vite @/* alias to src/*.')
  })

program.command('list')
  .description('List available registry items')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Override the configured registry URL')
  .action(async (options) => {
    const registry = options.registry ?? (await readConfig(path.resolve(options.cwd))).registry
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
  .action(async (names, options) => { await addComponents(names, { ...options, cwd: path.resolve(options.cwd) }) })

try {
  await program.parseAsync()
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
