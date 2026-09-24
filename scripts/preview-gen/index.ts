import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'
import { say } from '../lib/prompt.ts'
import { readRegistry } from '../registry-import/apply.ts'
import { pendingPreviews, previewSession } from './session.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

async function main(): Promise<void> {
  if (!process.stdin.isTTY) throw new Error('showcase:preview is interactive. Run it in a terminal.')
  const requested = process.argv.slice(2)
  const known = new Set((await readRegistry(root)).items.filter((item) => item.type === 'registry:ui').map((item) => item.name))
  const unknown = requested.filter((name) => !known.has(name))
  if (unknown.length) throw new Error(`Not a registry:ui item: ${unknown.join(', ')}. Choose from: ${[...known].join(', ')}.`)
  const names = requested.length ? requested : await pendingPreviews(root)

  say()
  say(`  ${paint('magenta', symbols.brand)} ${paint('bold', 'beast-ui')} ${paint('dim', 'showcase previews')}`)
  say()
  if (!names.length) {
    say(`  ${paint('green', symbols.ok)} Every component has a hand-written preview.`)
    say(`    ${paint('dim', 'Name components to redo theirs, e.g. bun run showcase:preview button.')}`)
    say()
    return
  }
  say(`  ${paint('dim', `${names.length} to go: ${names.join(', ')}`)}`)
  say()

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const { written } = await previewSession(root, prompt, names)
    if (written.length) {
      say(`  ${paint('green', symbols.brand)} ${paint('bold', `Wrote previews for ${written.join(', ')}.`)}`)
      say(`    ${paint('dim', 'See them with bun run dev at /components/<name>.')}`)
      say()
    }
  } finally {
    prompt.close()
  }
}

try {
  await main()
} catch (error) {
  say(`  ${paint('red', symbols.fail)} ${error instanceof Error ? error.message : String(error)}`)
  say()
  process.exitCode = 1
}
