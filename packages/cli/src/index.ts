#!/usr/bin/env node
import path from 'node:path'
import { Command, Option } from 'commander'
import type { Config } from '@beast-ui/registry/schema'
import packageJson from '../package.json' with { type: 'json' }
import { addComponents } from './commands/add.ts'
import { DEFAULT_REGISTRY, findConfig, initConfig } from './utils/config.ts'
import { fetchCatalog } from './utils/registry.ts'
import { catalogRows } from './utils/catalog.ts'
import { paint, symbols } from './utils/ui.ts'

interface InitOptions { cwd: string; registry: string; packageManager?: Config['packageManager'] }
interface ListOptions { cwd: string; registry?: string }
interface AddCommandOptions { cwd: string; registry?: string; dryRun?: boolean; overwrite?: boolean; skipInstall?: boolean; yes?: boolean }

const header = (command: string): void => {
  console.log()
  console.log(`  ${paint('magenta', symbols.brand)} ${paint('bold', 'beast-ui')} ${paint('dim', command)}`)
  console.log()
}

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
    header('init')
    const config = await initConfig(path.resolve(options.cwd), options.registry, options.packageManager)
    console.log(`  ${paint('green', symbols.ok)} Created beast-ui.json`)
    for (const [label, value] of [['registry', config.registry], ['components', config.paths.ui], ['utils', config.aliases.utils], ['installs with', config.packageManager]]) {
      console.log(`    ${paint('dim', label.padEnd(14))}${value}`)
    }
    console.log()
    console.log(`  ${paint('dim', 'Needs Tailwind CSS v4 and an @/* alias to src/* in TypeScript and your bundler.')}`)
    console.log(`  ${paint('dim', 'Next:')} beast-ui add button`)
    console.log()
  })

program.command('list')
  .description('List available registry items')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Override the configured registry URL')
  .action(async (options: ListOptions) => {
    const registry = options.registry ?? (await findConfig(path.resolve(options.cwd)))?.registry ?? DEFAULT_REGISTRY
    const rows = catalogRows((await fetchCatalog(registry)).items)
    header('list')
    // Variants sit under their base as `  └ name`; widths are measured without color codes.
    const plain = (row: (typeof rows)[number]) => (row.nested ? `  └ ${row.name}` : row.name)
    const width = Math.max(...rows.map((row) => plain(row).length)) + 3
    for (const row of rows) {
      const name = row.nested ? `  ${paint('dim', '└')} ${row.name}` : paint('bold', row.name)
      console.log(`  ${name}${' '.repeat(width - plain(row).length)}${paint('dim', row.description)}`)
    }
    console.log()
  })

program.command('add')
  .description('Add components and their registry dependencies')
  .argument('<components...>', 'Registry item names')
  .option('-c, --cwd <path>', 'Target project directory', '.')
  .option('-r, --registry <url>', 'Override the configured registry URL')
  .option('-y, --yes', 'Create beast-ui.json without asking if it is missing')
  .option('--dry-run', 'Show files and dependencies without writing or installing')
  .option('--overwrite', 'Replace existing files that differ from the registry')
  .option('--skip-install', 'Copy source files without installing npm dependencies')
  .action(async (names: string[], options: AddCommandOptions) => { await addComponents(names, { ...options, cwd: path.resolve(options.cwd) }) })

try {
  await program.parseAsync()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const [first, ...rest] = message.split('\n')
  console.error(`  ${paint('red', symbols.fail)} ${first}`)
  if (rest.length) console.error(paint('dim', rest.map((line) => `    ${line}`).join('\n')))
  console.error()
  process.exitCode = 1
}
