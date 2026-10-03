import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { toPascal, toTitle } from '../registry-import/analyze.ts'
import { readRegistry } from '../registry-import/apply.ts'
import { controlledPairs, type PreviewSpec } from './compose.ts'
import { analyzeProps, type ComponentProps } from './props.ts'

/**
 * Drafts showcase previews with the Cohere chat API (v2).
 *
 * The model proposes a PreviewSpec as JSON; this module validates the shape
 * against the component's real props, then the caller still runs the preview
 * through checkPreview and the usual Write it? confirmation. Nothing is
 * written on the model's word alone.
 */
export const COHERE_API_URL = 'https://api.cohere.com/v2/chat'
export const COHERE_MODEL = 'command-a-plus-05-2026'

export interface CohereOptions {
  /** Defaults to COHERE_API_KEY. */
  apiKey?: string
  /** Defaults to COHERE_MODEL, then north-mini-code-1-0. */
  model?: string
  maxTokens?: number
  fetch?: typeof fetch
}

export interface DraftInput {
  name: string
  component: string
  title: string
  description: string
  /** The component's .btsx source, so the model sees the real props. */
  source: string
  info: ComponentProps
}

const keyOf = (options: CohereOptions): string => {
  const key = options.apiKey ?? process.env.COHERE_API_KEY
  if (!key) throw new Error('Missing COHERE_API_KEY. Export it before using --ai.')
  return key
}

const modelOf = (options: CohereOptions): string => options.model ?? process.env.COHERE_MODEL ?? COHERE_MODEL

const SYSTEM = [
  'You write showcase previews for the Beast UI component registry.',
  'Answer with a single JSON object and nothing else.'
].join(' ')

/** The user prompt for one component: props, rules, and the component source. */
export function previewPrompt(input: DraftInput): string {
  const pairs = controlledPairs(input.info)
  const props = input.info.props.map((prop) => ({
    name: prop.name,
    required: prop.required,
    kind: prop.kind.type,
    values: prop.kind.type === 'union' ? prop.kind.values : undefined,
    parameter: prop.kind.type === 'handler' ? prop.kind.parameter : undefined,
    default: prop.defaultValue
  }))
  return [
    `Component: ${input.component} (registry name "${input.name}").`,
    `Title: ${input.title}.`,
    `Description: ${input.description || '-'}.`,
    `Takes children: ${input.info.acceptsChildren}.`,
    `Props: ${JSON.stringify(props)}.`,
    pairs.length
      ? `Controlled pairs (the only allowed controlled states): ${pairs.map((pair) => `${pair.prop.name}/${pair.handler.name}`).join(', ')}.`
      : 'There are no controlled pairs: state must be null, or a counter when onClick/onPress exists.',
    'Write a JSON object with exactly these fields:',
    '{"state": null | {"kind": "controlled", "prop": string, "handler": string, "initial": string, "status": string} | {"kind": "counter", "handler": string, "idle": string, "noun": string},',
    '"rows": [{"prop": string, "values": string[]}], "base": string, "label": string | null, "examples": [{"attrs": string, "label"?: string}], "note": string}.',
    "Rules: rows only for union props, values must come from the prop's own list.",
    'A controlled state must use one of the listed pairs; initial is the starting value as code (e.g. false, 0, "md"); status is a Beast expression starting with #{ that reports the value.',
    'A counter state is only allowed on an onClick/onPress handler prop.',
    'Attrs are Beast attributes only, e.g. size="lg" damping={8}: never JSX or element syntax, and string values always use double quotes.',
    "Every required prop must appear in base, in an example's attrs, or as the controlled state prop.",
    'Label is the children text for the main example; it must be null when the component does not take children, and example labels likewise.',
    'Note is one line of help under the preview; use the description unless it says nothing useful.',
    'Component source for reference:',
    input.source
  ].join('\n')
}

/**
 * One Cohere v2 chat call that must come back as a JSON object.
 *
 * Streams the answer and concatenates the text deltas, ignoring the model's
 * thinking blocks. Streaming because the reasoning models behind this
 * endpoint can think for minutes before the first answer token; a single
 * non-streamed call would sit silent until the whole reply is done.
 */
export async function chatJson(system: string, user: string, options: CohereOptions = {}): Promise<unknown> {
  const model = modelOf(options)
  const run = options.fetch ?? fetch
  let response: Response
  try {
    response = await run(COHERE_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${keyOf(options)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        // No response_format: north-mini-code-1-0 rejects it ("not supported
        // with the specified model"). The prompt demands a single JSON object
        // and parsePreviewSpec validates the shape instead.
        ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens })
      }),
      signal: AbortSignal.timeout(600_000)
    })
  } catch (error) {
    throw new Error(`Could not reach Cohere: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) throw new Error(`Cohere request failed (${response.status}) while drafting with ${model}`)
  if (!response.body) throw new Error(`Cohere returned no text while drafting with ${model}`)
  let text = ''
  try {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice('data:'.length).trim()
        if (data === '[DONE]') continue
        let event: { delta?: { message?: { content?: { text?: unknown } } } }
        try {
          event = JSON.parse(data) as typeof event
        } catch {
          continue
        }
        const chunk = event.delta?.message?.content?.text
        if (typeof chunk === 'string') text += chunk
      }
    }
  } catch (error) {
    throw new Error(`Could not reach Cohere: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!text.trim()) throw new Error(`Cohere returned no text while drafting with ${model}`)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`Cohere did not return a JSON object while drafting with ${model}`)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Checks a model-proposed spec against the component's real props. */
export function parsePreviewSpec(input: DraftInput, value: unknown): PreviewSpec {
  if (!isRecord(value)) throw new Error('Cohere draft failed validation: the top level is not an object')
  const pairs = new Map(controlledPairs(input.info).map((pair) => [`${pair.prop.name}/${pair.handler.name}`, pair]))
  const byName = new Map(input.info.props.map((prop) => [prop.name, prop]))

  let state: PreviewSpec['state']
  if (value.state !== null && value.state !== undefined) {
    if (!isRecord(value.state) || typeof value.state.kind !== 'string') {
      throw new Error('Cohere draft failed validation: state must be null, controlled, or counter')
    }
    if (value.state.kind === 'controlled') {
      const { prop, handler, initial, status } = value.state as Record<string, unknown>
      if (typeof prop !== 'string' || typeof handler !== 'string' || !pairs.has(`${prop}/${handler}`)) {
        throw new Error(
          `Cohere draft failed validation: ${JSON.stringify(prop)}/${JSON.stringify(handler)} is not a controlled pair of ${input.name}`
        )
      }
      if (typeof initial !== 'string' || !initial.trim() || typeof status !== 'string' || !status.startsWith('#{')) {
        throw new Error(
          'Cohere draft failed validation: a controlled state needs an initial value and a #{status} expression'
        )
      }
      state = { kind: 'controlled', prop, handler, initial, status }
    } else if (value.state.kind === 'counter') {
      const { handler, idle, noun } = value.state as Record<string, unknown>
      const press = typeof handler === 'string' ? byName.get(handler) : undefined
      if (!press || press.kind.type !== 'handler' || (press.name !== 'onClick' && press.name !== 'onPress')) {
        throw new Error(`Cohere draft failed validation: ${JSON.stringify(handler)} cannot count presses`)
      }
      if (typeof idle !== 'string' || !idle.trim() || typeof noun !== 'string' || !noun.trim()) {
        throw new Error('Cohere draft failed validation: a counter state needs idle text and a noun')
      }
      state = { kind: 'counter', handler: press.name, idle, noun }
    } else {
      throw new Error('Cohere draft failed validation: state must be null, controlled, or counter')
    }
  }

  if (!Array.isArray(value.rows)) throw new Error('Cohere draft failed validation: rows must be an array')
  const rows: PreviewSpec['rows'] = value.rows.map((row: unknown) => {
    if (!isRecord(row) || typeof row.prop !== 'string' || !Array.isArray(row.values)) {
      throw new Error('Cohere draft failed validation: each row needs a prop and values')
    }
    const prop = byName.get(row.prop)
    if (!prop || prop.kind.type !== 'union') {
      throw new Error(
        `Cohere draft failed validation: ${JSON.stringify(row.prop)} is not a union prop of ${input.name}`
      )
    }
    const allowed = prop.kind.values
    const values = row.values.map((entry: unknown) => {
      if (typeof entry !== 'string' || !allowed.includes(entry)) {
        throw new Error(`Cohere draft failed validation: ${JSON.stringify(entry)} is not a ${row.prop}`)
      }
      return entry
    })
    if (!values.length) throw new Error(`Cohere draft failed validation: row ${JSON.stringify(row.prop)} has no values`)
    if (state?.kind === 'controlled' && state.prop === row.prop) {
      throw new Error(`Cohere draft failed validation: row ${JSON.stringify(row.prop)} duplicates the controlled state`)
    }
    return { prop: row.prop, values }
  })

  if (typeof value.base !== 'string') throw new Error('Cohere draft failed validation: base must be a string')
  const label = value.label === null || value.label === undefined || value.label === '' ? undefined : value.label
  if (label !== undefined && typeof label !== 'string') {
    throw new Error('Cohere draft failed validation: label must be a string or null')
  }
  if (label !== undefined && !input.info.acceptsChildren) {
    throw new Error(`Cohere draft failed validation: ${input.name} does not take children, so label must be null`)
  }
  if (!Array.isArray(value.examples)) throw new Error('Cohere draft failed validation: examples must be an array')
  const examples: PreviewSpec['examples'] = value.examples.map((example: unknown) => {
    if (!isRecord(example) || typeof example.attrs !== 'string' || !example.attrs.trim()) {
      throw new Error('Cohere draft failed validation: each example needs attrs')
    }
    if (example.label !== undefined && typeof example.label !== 'string') {
      throw new Error('Cohere draft failed validation: an example label must be a string')
    }
    if (example.label !== undefined && !input.info.acceptsChildren) {
      throw new Error(
        `Cohere draft failed validation: ${input.name} does not take children, so examples take no labels`
      )
    }
    return example.label === undefined ? { attrs: example.attrs } : { attrs: example.attrs, label: example.label }
  })
  if (typeof value.note !== 'string') throw new Error('Cohere draft failed validation: note must be a string')

  const covered = new Set([
    ...(state?.kind === 'controlled' ? [state.prop] : []),
    ...rows.map((row) => row.prop),
    ...value.base.split(/[\s=]+/).filter(Boolean),
    ...examples.flatMap((example) => example.attrs.split(/[\s=]+/).filter(Boolean))
  ])
  for (const prop of input.info.props) {
    if (
      prop.required &&
      prop.defaultValue === undefined &&
      prop.kind.type !== 'handler' &&
      prop.kind.type !== 'children' &&
      !covered.has(prop.name)
    ) {
      throw new Error(`Cohere draft failed validation: required prop ${JSON.stringify(prop.name)} is not set`)
    }
  }
  return {
    name: input.name,
    component: input.component,
    state,
    rows,
    base: value.base,
    label,
    examples,
    note: value.note
  }
}

/** Drafts a PreviewSpec for a registry component with the Cohere chat API. */
export async function draftPreviewSpec(input: DraftInput, options: CohereOptions = {}): Promise<PreviewSpec> {
  return parsePreviewSpec(input, await chatJson(SYSTEM, previewPrompt(input), options))
}

/** Reads a registry component and drafts its preview with the Cohere chat API. */
export async function draftPreviewForComponent(
  root: string,
  name: string,
  options: CohereOptions = {}
): Promise<PreviewSpec> {
  const item = (await readRegistry(root)).items.find((entry) => entry.name === name)
  const source = await readFile(path.join(root, 'packages/registry/ui', `${name}.btsx`), 'utf8')
  return draftPreviewSpec(
    {
      name,
      component: toPascal(name),
      title: item?.title ?? toTitle(name),
      description: item?.description ?? '',
      source,
      info: analyzeProps(root, name)
    },
    options
  )
}
