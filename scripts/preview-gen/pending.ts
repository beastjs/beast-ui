import { fileURLToPath } from 'node:url'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'
import { printHelp, say, wantsHelp } from '../lib/prompt.ts'
import { readRegistry } from '../registry-import/apply.ts'
import { previewStatus, type PreviewStatus } from './session.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

export interface PendingPreview {
  name: string
  title: string
  status: Exclude<PreviewStatus, 'custom'>
}

/** registry:ui items still waiting for a hand-written preview, with why. */
export async function pendingDetails(rootDir: string): Promise<PendingPreview[]> {
  const registry = await readRegistry(rootDir)
  const pending: PendingPreview[] = []
  for (const item of registry.items) {
    if (item.type !== 'registry:ui') continue
    const status = await previewStatus(rootDir, item.name, item.description ?? '')
    if (status !== 'custom') pending.push({ name: item.name, title: item.title ?? item.name, status })
  }
  return pending
}

const HELP = [
  `${paint('bold', 'bun run showcase:pending')} ${paint('dim', '[--json]')}`,
  '',
  'Lists registry:ui components still waiting for a hand-written preview:',
  'missing means no preview file yet, starter means the importer placeholder.',
  'One component per line; --json prints [{ name, title, status }] instead.',
  '',
  `Guide: ${paint('cyan', 'docs/adding-components.md')}`,
]

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (wantsHelp(argv)) { printHelp(HELP); return }
  const json = argv.includes('--json')
  const unknown = argv.find((arg) => arg !== '--json')
  if (unknown) throw new Error(`Unknown flag: ${unknown}. See --help.`)
  const pending = await pendingDetails(root)
  if (json) {
    process.stdout.write(`${JSON.stringify(pending, null, 2)}\n`)
    return
  }
  if (!pending.length) {
    say(`  ${paint('green', symbols.ok)} Every component has a hand-written preview.`)
    say()
    return
  }
  for (const item of pending) say(`${item.name} — ${item.title} (${item.status})`)
}

try {
  await main()
} catch (error) {
  say(`  ${paint('red', symbols.fail)} ${error instanceof Error ? error.message : String(error)}`)
  say()
  process.exitCode = 1
}
