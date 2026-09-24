import { fileURLToPath } from 'node:url'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'
import { createPrompt, printHelp, say, wantsHelp } from '../lib/prompt.ts'
import { readRegistry } from '../registry-import/apply.ts'
import { pendingPreviews, previewSession } from './session.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

const HELP = [
  `${paint('bold', 'bun run showcase:preview')} ${paint('dim', '[name...]')}`,
  '',
  'Writes showcase previews (apps/web/src/previews/<name>-preview.btsx) from a',
  "component's props. Without names it covers every component whose preview",
  "is missing or still the importer's starter; name components to redo theirs.",
  '',
  paint('dim', 'For each component it asks'),
  '  Label                        children text, when the component takes children',
  '  Interactive state            a value and its handler, e.g. checked/onChange,',
  '                               or a press counter on onClick',
  '  Show a row with each <prop>  one example per value of a union prop',
  '  Props for every example      Beast attributes, e.g. size="lg" damping={8}',
  '  Add a disabled example?      when the component has disabled',
  '  Another example              more examples; blank to finish',
  '  Note under the preview       defaults to the registry description',
  '  Write it?                    y to write, r to redo, s to skip, q to stop',
  '',
  paint('dim', 'Checks'),
  '  The preview is compiled and typechecked against the component before it is',
  '  written. Problems are listed with the allowed values.',
  '',
  paint('dim', 'Answers'),
  '  Enter accepts the value in parentheses; - means none. Ctrl+C stops;',
  '  previews already written are kept.',
  '',
  `Guide: ${paint('cyan', 'docs/adding-components.md')}`,
]

async function main(): Promise<void> {
  const requested = process.argv.slice(2)
  if (wantsHelp(requested)) { printHelp(HELP); return }
  if (!process.stdin.isTTY) throw new Error('showcase:preview is interactive. Run it in a terminal, or pass --help.')
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

  const prompt = createPrompt()
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
