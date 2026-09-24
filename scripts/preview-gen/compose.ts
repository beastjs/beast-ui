import type { ComponentProps, PropInfo } from './props.ts'

export type PreviewState =
  /** A controlled value, e.g. `checked` with `onChange`. `status` is a Beast text line body. */
  | { kind: 'controlled'; prop: string; handler: string; initial: string; type?: string; status?: string }
  /** Counts presses through a handler such as `onClick`. */
  | { kind: 'counter'; handler: string; idle: string; noun: string }

export interface PreviewRow {
  prop: string
  values: string[]
}

export interface PreviewExample {
  /** Beast attributes as written, e.g. `variant="outline" disabled={true}`. */
  attrs: string
  label?: string
}

export interface PreviewSpec {
  name: string
  component: string
  state?: PreviewState
  rows: PreviewRow[]
  /** Attributes shared by every example. */
  base: string
  /** Children text for the main example, when the component takes children. */
  label?: string
  examples: PreviewExample[]
  note: string
}

export interface ControlledPair {
  prop: PropInfo
  handler: PropInfo
}

const SIMPLE = new Set(['boolean', 'number', 'string', 'union'])

/** Value props with a change handler whose argument has the same type, e.g. checked + onChange(boolean). */
export function controlledPairs(info: ComponentProps): ControlledPair[] {
  const byName = new Map(info.props.map((prop) => [prop.name, prop]))
  const pairs: ControlledPair[] = []
  for (const handler of info.props) {
    if (handler.kind.type !== 'handler' || handler.kind.parameter === undefined) continue
    const named = /^on([A-Z]\w*)Change$/.exec(handler.name)
    const candidates = named ? [named[1].charAt(0).toLowerCase() + named[1].slice(1)] : handler.name === 'onChange' ? ['value', 'checked', 'open'] : []
    for (const candidate of candidates) {
      const prop = byName.get(candidate)
      if (prop && SIMPLE.has(prop.kind.type) && matches(prop, handler.kind.parameter)) { pairs.push({ prop, handler }); break }
    }
  }
  return pairs
}

function matches(prop: PropInfo, parameter: string): boolean {
  if (prop.kind.type === 'union') return prop.kind.values.every((value) => parameter.includes(`"${value}"`))
  return parameter === prop.kind.type
}

export function initialFor(prop: PropInfo): string {
  if (prop.defaultValue !== undefined) return prop.defaultValue
  switch (prop.kind.type) {
    case 'boolean': return 'false'
    case 'number': return '0'
    case 'union': return JSON.stringify(prop.kind.values[0])
    default: return '""'
  }
}

export const plural = (word: string): string =>
  /(?:s|x|ch|sh)$/.test(word) ? `${word}es` : /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`

const setterOf = (name: string) => `set${name.charAt(0).toUpperCase()}${name.slice(1)}`
const join = (...parts: (string | undefined)[]) => parts.map((part) => part?.trim()).filter(Boolean).join(' ')
// Text containing `#{` would read as interpolation, so it goes in as a string expression.
const text = (value: string) => (value.includes('#{') ? `#{${JSON.stringify(value)}}` : value)

export function composePreview(spec: PreviewSpec): string {
  const { state, component } = spec
  const lines: string[] = []
  if (state) lines.push('import { useState } from "octane";')
  lines.push(`import ${component} from "@beast-ui/registry/ui/${spec.name}";`, '')

  if (spec.rows.length) {
    lines.push('module')
    for (const row of spec.rows) lines.push(`  const ${plural(row.prop)} = [${row.values.map((value) => JSON.stringify(value)).join(', ')}] as const`)
    lines.push('')
  }

  lines.push('props {}:{}')
  if (state?.kind === 'controlled') {
    lines.push('setup', `  const [${state.prop}, ${setterOf(state.prop)}] = useState${state.type ? `<${state.type}>` : ''}(${state.initial})`)
  } else if (state?.kind === 'counter') {
    lines.push('setup', '  const [count, setCount] = useState(0)')
  }

  const counter = state?.kind === 'counter' ? `${state.handler}={() => setCount(count + 1)}` : undefined
  const element = (attrs: string, label?: string, expression?: string) => {
    const args = join(attrs)
    const body = expression === undefined ? (label ? text(label) : '') : `#{${expression}}`
    return `${component}${args ? `(${args})` : ''}${body ? ` ${body}` : ''}`
  }

  lines.push(`div(className="flex flex-col items-center gap-${spec.rows.length ? 8 : 6}")`)
  // The interactive example leads, unless the rows already carry the counter.
  if (state?.kind === 'controlled') {
    lines.push(`  ${element(join(`${state.prop}={${state.prop}}`, `${state.handler}={${setterOf(state.prop)}}`, spec.base), spec.label)}`)
  } else if (!spec.rows.length) {
    lines.push(`  ${element(join(counter, spec.base), spec.label)}`)
  }
  for (const row of spec.rows) {
    lines.push('  div(className="flex flex-wrap items-center justify-center gap-4")')
    lines.push(`    each ${row.prop} in ${plural(row.prop)} key ${row.prop}`)
    lines.push(`      ${element(join(`${row.prop}={${row.prop}}`, counter, spec.base), undefined, spec.label === undefined ? undefined : row.prop)}`)
  }
  if (spec.examples.length) {
    lines.push('  div(className="flex flex-wrap items-center justify-center gap-4")')
    for (const example of spec.examples) lines.push(`    ${element(join(spec.base, example.attrs), example.label)}`)
  }

  if (state?.kind === 'controlled' && state.status) {
    lines.push(`  p(role="status" className="text-sm text-muted-foreground") ${state.status}`)
  } else if (state?.kind === 'counter') {
    const status = `count === 0 ? ${JSON.stringify(state.idle)} : \`${state.noun} \${count} \${count === 1 ? "time" : "times"}.\``
    lines.push(`  p(role="status" className="text-sm text-muted-foreground") #{${status}}`)
  }
  if (spec.note.trim()) lines.push(`  p(className="max-w-md text-center text-xs leading-relaxed text-muted-foreground") ${text(spec.note.trim())}`)
  return `${lines.join('\n')}\n`
}

/** A status line that reports a boolean: one text for each value. */
export const booleanStatus = (prop: string, whenTrue: string, whenFalse: string): string =>
  `#{${prop} ? ${JSON.stringify(whenTrue)} : ${JSON.stringify(whenFalse)}}`

/** A status line that reports a value: `{value}` in the template becomes the current value. */
export function valueStatus(prop: string, template: string): string {
  const escaped = template.replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${')
  return `#{\`${escaped.replaceAll('{value}', `\${${prop}}`)}\`}`
}
