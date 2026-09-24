import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Interface } from 'node:readline/promises'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'
import { toPascal, toTitle } from '../registry-import/analyze.ts'
import { paths, previewSource, readRegistry, registeredIcon, registerPreview } from '../registry-import/apply.ts'
import { ask, confirm, fail, iconNames, list, say } from '../lib/prompt.ts'
import { checkPreview } from './check.ts'
import { booleanStatus, composePreview, controlledPairs, initialFor, plural, valueStatus, type PreviewExample, type PreviewRow, type PreviewSpec, type PreviewState } from './compose.ts'
import { analyzeProps, type ComponentProps, type PropInfo } from './props.ts'

export type PreviewStatus = 'missing' | 'starter' | 'custom'

export async function previewStatus(root: string, name: string, description: string): Promise<PreviewStatus> {
  const source = await readFile(path.join(root, paths.preview(name)), 'utf8').catch(() => undefined)
  if (source === undefined) return 'missing'
  return source === previewSource({ name, description }) ? 'starter' : 'custom'
}

/** registry:ui items whose preview is missing or still the importer's starter. */
export async function pendingPreviews(root: string): Promise<string[]> {
  const pending: string[] = []
  for (const item of (await readRegistry(root)).items) {
    if (item.type === 'registry:ui' && (await previewStatus(root, item.name, item.description ?? '')) !== 'custom') pending.push(item.name)
  }
  return pending
}

function describeType(prop: PropInfo): string {
  const { kind } = prop
  switch (kind.type) {
    case 'union': return kind.values.map((value) => JSON.stringify(value)).join(' | ')
    case 'handler': return `(${kind.parameter ?? ''}) => void`
    case 'children': return 'text or elements'
    case 'other': return kind.text
    default: return kind.type
  }
}

function showProps(info: ComponentProps): void {
  if (!info.props.length) return
  const width = Math.max(...info.props.map((prop) => prop.name.length)) + 2
  say(`  ${paint('dim', 'Props')}`)
  for (const prop of info.props) {
    const type = describeType(prop)
    const shown = type.length > 70 ? `${type.slice(0, 67)}...` : type
    const fallback = prop.defaultValue === undefined ? '' : paint('dim', ` = ${prop.defaultValue}`)
    say(`    ${paint('cyan', symbols.item)} ${(prop.name + (prop.required ? '' : '?')).padEnd(width)}${paint('dim', shown)}${fallback}`)
  }
  say()
}

/** Formats a value as a Beast attribute: strings are quoted, anything else is an expression. */
const attribute = (prop: PropInfo, value: string): string =>
  prop.kind.type === 'string' || (prop.kind.type === 'union' && !/^["'`{]/.test(value)) ? `${prop.name}=${JSON.stringify(value.replace(/^["']|["']$/g, ''))}` : `${prop.name}={${value}}`

async function askState(prompt: Interface, info: ComponentProps, label: string): Promise<PreviewState | undefined> {
  const pairs = controlledPairs(info)
  if (pairs.length) {
    const options = pairs.map((pair) => `${pair.prop.name}/${pair.handler.name}`)
    const choice = await ask(prompt, 'Interactive state', {
      initial: options[0],
      hint: options.length === 1 ? '- for none' : `- for none · ${options.join(', ')}`,
      validate: (value) => value === '-' || options.includes(value) ? undefined : `Choose one of: ${options.join(', ')}, or -.`,
    })
    const pair = pairs[options.indexOf(choice)]
    if (!pair) return undefined
    const { prop, handler } = pair
    const initial = await ask(prompt, `Initial ${prop.name}`, { initial: initialFor(prop) })
    const title = toTitle(prop.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    let status: string
    if (prop.kind.type === 'boolean') {
      const whenTrue = await ask(prompt, `Status when ${prop.name} is true`, { initial: `${title}: on.` })
      const whenFalse = await ask(prompt, `Status when ${prop.name} is false`, { initial: `${title}: off.` })
      status = booleanStatus(prop.name, whenTrue, whenFalse)
    } else {
      status = valueStatus(prop.name, await ask(prompt, 'Status line', { initial: `${title}: {value}`, hint: '{value} is replaced' }))
    }
    const type = prop.kind.type === 'union' ? prop.kind.values.map((value) => JSON.stringify(value)).join(' | ') : undefined
    return { kind: 'controlled', prop: prop.name, handler: handler.name, initial, type, status }
  }
  const press = info.props.find((prop) => prop.name === 'onClick' || prop.name === 'onPress')
  if (press && await confirm(prompt, `Count presses with ${press.name}?`, true)) {
    const idle = await ask(prompt, 'Status before the first press', { initial: `Try the ${label.toLowerCase()} to check the interaction.` })
    const noun = await ask(prompt, 'Status after, before the count', { initial: 'Pressed', hint: 'e.g. Pressed → "Pressed 3 times."' })
    return { kind: 'counter', handler: press.name, idle, noun }
  }
  return undefined
}

async function askRows(prompt: Interface, info: ComponentProps, state: PreviewState | undefined): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = []
  for (const prop of info.props) {
    if (prop.kind.type !== 'union' || (state?.kind === 'controlled' && state.prop === prop.name)) continue
    const values = prop.kind.values
    if (!(await confirm(prompt, `Show a row with each ${prop.name}?`, true))) continue
    const chosen = list(await ask(prompt, `${plural(prop.name)} to show`, {
      initial: values.join(', '),
      validate: (answer) => {
        const unknown = list(answer).filter((value) => !values.includes(value))
        return list(answer).length === 0 ? 'Choose at least one.' : unknown.length ? `Not a ${prop.name}: ${unknown.join(', ')}.` : undefined
      },
    }))
    rows.push({ prop: prop.name, values: chosen })
  }
  return rows
}

async function askExamples(prompt: Interface, info: ComponentProps, label: string | undefined): Promise<PreviewExample[]> {
  const examples: PreviewExample[] = []
  if (info.props.some((prop) => prop.name === 'disabled') && await confirm(prompt, 'Add a disabled example?', true)) {
    examples.push({ attrs: 'disabled={true}', label: label === undefined ? undefined : 'Disabled' })
  }
  for (;;) {
    const attrs = (await prompt.question(`  ${paint('cyan', '?')} Another example ${paint('dim', 'props, e.g. size="lg" damping={8} · blank to finish')} `)).trim()
    if (!attrs) return examples
    const exampleLabel = label === undefined ? undefined : await ask(prompt, 'Its label', { initial: label })
    examples.push({ attrs, label: exampleLabel })
  }
}

async function askSpec(root: string, prompt: Interface, name: string, info: ComponentProps): Promise<{ spec: PreviewSpec; icon?: string }> {
  const item = (await readRegistry(root)).items.find((entry) => entry.name === name)
  const title = item?.title ?? toTitle(name)
  const label = info.acceptsChildren ? await ask(prompt, 'Label', { initial: title, hint: 'children text' }) : undefined
  const state = await askState(prompt, info, title)
  const rows = await askRows(prompt, info, state)

  const required = info.props.filter((prop) => prop.required && prop.defaultValue === undefined && prop.kind.type !== 'handler' && prop.kind.type !== 'children'
    && !(state?.kind === 'controlled' && state.prop === prop.name) && !rows.some((row) => row.prop === prop.name))
  const suggested: string[] = []
  for (const prop of required) suggested.push(attribute(prop, await ask(prompt, `${prop.name} (required)`, { required: true, initial: prop.kind.type === 'union' ? prop.kind.values[0] : undefined })))
  const base = await ask(prompt, 'Props for every example', { initial: suggested.join(' ') || '-', hint: '- for none' })

  const examples = await askExamples(prompt, info, label)
  const note = await ask(prompt, 'Note under the preview', { initial: item?.description ?? '', hint: '- for none' })

  const index = await readFile(path.join(root, paths.previews), 'utf8')
  let icon: string | undefined
  if (!registeredIcon(index, name)) {
    const icons = await iconNames(root)
    const baseIcon = item?.meta?.variantOf ? registeredIcon(index, item.meta.variantOf) : undefined
    icon = await ask(prompt, 'Showcase icon', { initial: baseIcon ?? 'folder', hint: icons.join(', '), validate: (value) => icons.includes(value) ? undefined : `Choose one of: ${icons.join(', ')}.` })
  }
  return {
    spec: { name, component: toPascal(name), state, rows, base: base === '-' ? '' : base, label, examples, note: note === '-' ? '' : note },
    icon,
  }
}

export interface SessionResult {
  written: string[]
  quit: boolean
}

/** Walks the named components, writing one preview each. */
export async function previewSession(root: string, prompt: Interface, names: string[]): Promise<SessionResult> {
  const written: string[] = []
  for (const [position, name] of names.entries()) {
    const item = (await readRegistry(root)).items.find((entry) => entry.name === name)
    if (!item || item.type !== 'registry:ui') { fail(`${name} is not a registry:ui item; skipped.`); say(); continue }

    say(`  ${paint('bold', `[${position + 1}/${names.length}]`)} ${paint('bold', name)} ${paint('dim', `· ${toPascal(name)} from @beast-ui/registry/ui/${name}`)}`)
    say()
    const status = await previewStatus(root, name, item.description ?? '')
    if (status === 'custom' && !(await confirm(prompt, `${paths.preview(name)} is hand-written. Replace it?`, false))) { say(); continue }

    const info = analyzeProps(root, name)
    showProps(info)

    for (;;) {
      const { spec, icon } = await askSpec(root, prompt, name, info)
      const source = composePreview(spec)
      say()
      say(`  ${paint('dim', `${paths.preview(name)}`)}`)
      say(source.trimEnd().split('\n').map((line) => `    ${paint('dim', '│')} ${line}`).join('\n'))
      say()
      const problems = checkPreview(root, name, source)
      if (problems.length) {
        say(`  ${paint('yellow', '!')} ${problems.length === 1 ? 'A problem' : `${problems.length} problems`} with this preview:`)
        for (const problem of problems) say(paint('dim', problem.split('\n').map((line, index) => `    ${index === 0 ? paint('yellow', symbols.item) : ' '} ${line}`).join('\n')))
      } else {
        say(`  ${paint('green', symbols.ok)} Compiles and typechecks against ${toPascal(name)}'s props`)
      }
      say()

      const action = (await ask(prompt, 'Write it?', {
        initial: problems.length ? 'r' : 'y',
        hint: 'y · r to redo · s to skip · q to quit',
        validate: (value) => /^[yrsq]$/i.test(value) ? undefined : 'Answer y, r, s, or q.',
      })).toLowerCase()
      if (action === 'q') return { written, quit: true }
      if (action === 's') { say(`  ${paint('dim', `Skipped ${name}.`)}`); say(); break }
      if (action === 'r') { say(); continue }

      await writeFile(path.join(root, paths.preview(name)), source)
      const indexPath = path.join(root, paths.previews)
      const index = await readFile(indexPath, 'utf8')
      const registered = registeredIcon(index, name)
      if (!registered || icon) await writeFile(indexPath, registerPreview(index, { name, icon: icon ?? registered ?? 'folder' }))
      written.push(name)
      say(`  ${paint('green', symbols.ok)} Wrote ${paths.preview(name)}${registered ? '' : ` ${paint('dim', `and registered it in ${paths.previews}`)}`}`)
      say()
      break
    }
  }
  return { written, quit: false }
}
