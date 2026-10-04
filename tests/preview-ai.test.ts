import { describe, expect, test } from 'bun:test'
import {
  draftPreviewSpec,
  parsePreviewSpec,
  previewPrompt,
  type DraftInput,
} from '../scripts/preview-gen/cohere.ts'
import type { ComponentProps } from '../scripts/preview-gen/props.ts'

const info: ComponentProps = {
  acceptsChildren: true,
  props: [
    { name: 'variant', required: false, kind: { type: 'union', values: ['default', 'outline'] } },
    { name: 'checked', required: false, kind: { type: 'boolean' } },
    { name: 'onChange', required: false, kind: { type: 'handler', parameter: 'boolean' } },
    { name: 'onClick', required: false, kind: { type: 'handler', parameter: 'MouseEvent' } },
    { name: 'disabled', required: false, kind: { type: 'boolean' }, defaultValue: 'false' },
    { name: 'children', required: false, kind: { type: 'children' } },
  ],
}

const input: DraftInput = {
  name: 'button',
  component: 'Button',
  title: 'Button',
  description: 'An accessible button.',
  source: 'props { variant = "default" }: Props',
  info,
}

const spec: Record<string, unknown> = {
  state: { kind: 'controlled', prop: 'checked', handler: 'onChange', initial: 'false', status: '#{checked ? "On." : "Off."}' },
  rows: [{ prop: 'variant', values: ['default', 'outline'] }],
  base: '',
  label: 'Button',
  examples: [{ attrs: 'disabled={true}', label: 'Disabled' }],
  note: 'An accessible button.',
}

function stubFetch(seen: { url?: string; init?: RequestInit }, body: string, status = 200): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    seen.url = url
    seen.init = init
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof fetch
}

/** An SSE payload: one thinking block (ignored) plus text deltas. */
const sse = (texts: string[]): string =>
  [
    'event: content-start',
    'data: {"type":"content-start","index":0,"delta":{"message":{"content":{"type":"thinking","thinking":""}}}}',
    '',
    ...texts.flatMap((text) => [
      'event: content-delta',
      `data: ${JSON.stringify({ type: 'content-delta', index: 1, delta: { message: { content: { text } } } })}`,
      '',
    ]),
    'data: [DONE]',
    '',
  ].join('\n')

describe('preview drafting', () => {
  test('prompt carries the component, union values, and pairs', () => {
    const prompt = previewPrompt(input)
    expect(prompt).toContain('Button')
    expect(prompt).toContain('"default"')
    expect(prompt).toContain('checked/onChange')
  })

  test('a valid draft round-trips through the stubbed chat', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const parsed = await draftPreviewSpec(input, { apiKey: 'k', fetch: stubFetch(seen, sse([JSON.stringify(spec)])) })
    expect(parsed).toMatchObject({ name: 'button', component: 'Button', base: '', label: 'Button', note: 'An accessible button.' })
    expect(parsed.rows).toEqual([{ prop: 'variant', values: ['default', 'outline'] }])
  })

  test('unknown union values and pairs are rejected', () => {
    expect(() => parsePreviewSpec(input, { ...spec, rows: [{ prop: 'variant', values: ['nope'] }] })).toThrow('not a variant')
    expect(() => parsePreviewSpec(input, { ...spec, state: { kind: 'controlled', prop: 'disabled', handler: 'onChange', initial: 'false', status: '#{x}' } })).toThrow('not a controlled pair')
    expect(() => parsePreviewSpec(input, { ...spec, state: { kind: 'counter', handler: 'onChange', idle: 'Try.', noun: 'Pressed' } })).toThrow('cannot count presses')
  })

  test('labels are rejected when the component takes no children', () => {
    const noKids: DraftInput = { ...input, info: { ...info, acceptsChildren: false } }
    expect(() => parsePreviewSpec(noKids, { ...spec, label: 'Button' })).toThrow('does not take children')
  })

  test('required props must be set somewhere', () => {
    const strict: DraftInput = {
      ...input,
      info: { ...info, props: [...info.props, { name: 'tone', required: true, kind: { type: 'union', values: ['a', 'b'] } }] },
    }
    expect(() => parsePreviewSpec(strict, spec)).toThrow('required prop "tone"')
    expect(parsePreviewSpec(strict, { ...spec, base: 'tone="a"' }).base).toBe('tone="a"')
  })
})
