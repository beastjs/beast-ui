/// <reference types="bun" />

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { createServer, type ViteDevServer } from 'vite'

let server: ViteDevServer
beforeAll(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
  })
})
afterAll(async () => { await server?.close() })

describe('rendered components', () => {
  test('new motion components render with defaults and explicit props', async () => {
    const { renderToString } = await server.ssrLoadModule('octane/server')
    const { default: ScrubField } = await server.ssrLoadModule('@beast-ui/registry/ui/scrubfield')
    const { default: Squishy } = await server.ssrLoadModule('@beast-ui/registry/ui/squishy')
    const field = renderToString(ScrubField).html
    expect(field).toContain('role="spinbutton"')
    expect(field).toContain('aria-valuenow="0"')
    expect(field).not.toMatch(/NaN|undefinedpx/)
    const customField = renderToString(ScrubField, { label: 'Opacity', value: 50, suffix: '%', disabled: true }).html
    expect(customField).toContain('Opacity')
    expect(customField).toContain('aria-valuenow="50"')
    expect(customField).toContain('aria-valuetext="50 %"')
    expect(customField).toContain('disabled')
    const toggle = renderToString(Squishy).html
    expect(toggle).toContain('role="switch"')
    expect(toggle).toContain('aria-checked="false"')
    expect(toggle).not.toMatch(/NaN|undefinedpx/)
    const customToggle = renderToString(Squishy, { checked: true, label: 'Notifications', disabled: true }).html
    expect(customToggle).toContain('aria-checked="true"')
    expect(customToggle).toContain('Notifications')
    expect(customToggle).toMatch(/<button[^>]*\sdisabled(?:[\s=>])/)
  })

  test('CallChip renders defaults, icons, statuses, and optional retry accessibly', async () => {
    const { renderToString } = await server.ssrLoadModule('octane/server')
    const { default: CallChip } = await server.ssrLoadModule('@beast-ui/registry/ui/call-chip')
    const html = renderToString(CallChip).html
    expect(html).toContain('data-status="idle"')
    expect(html).toContain('queued')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/NaN|undefined/)
    for (const status of ['running', 'done', 'error']) {
      const result = renderToString(CallChip, { status, icon: 'search', name: 'Search', argument: 'docs', className: 'custom-chip', showTimer: false, onRetry: () => {} }).html
      expect(result).toContain(`data-status="${status}"`)
      expect(result).toContain('custom-chip')
      expect(result.includes('aria-busy="true"')).toBe(status === 'running')
      expect(result.includes('aria-label="Retry Search docs"')).toBe(status === 'error')
      expect(result).not.toContain('tabular-nums')
    }
    expect(renderToString(CallChip, { status: 'error' }).html).not.toContain('<button')
  })

  test('Button resolves state callbacks and merges custom classes', async () => {
    const { default: Button } = await server.ssrLoadModule('@beast-ui/registry/ui/button')
    const { renderToString } = await server.ssrLoadModule('octane/server')
    for (const disabled of [false, true]) {
      const states: boolean[] = []
      const { html } = renderToString(Button, {
        disabled,
        className: (state: { disabled: boolean }) => {
          states.push(state.disabled)
          return state.disabled ? 'opacity-75 h-12' : 'opacity-100 h-12'
        },
      })
      expect(states).toEqual([disabled])
      expect(html).toContain(disabled ? 'opacity-75' : 'opacity-100')
      expect(html).toContain('h-12')
      expect(html).not.toMatch(/\bh-8\b/)
    }
    expect(renderToString(Button, { className: 'custom-class' }).html).toContain('custom-class')
  })

  test('docs preserve command line breaks and complete alias instructions', async () => {
    const { default: App } = await server.ssrLoadModule('/src/App.btsx')
    const { renderToString } = await server.ssrLoadModule('octane/server')
    const { html } = renderToString(App)
    expect(html).toContain('http://127.0.0.1:5173/r\nbun run cli add button --cwd ../my-app --dry-run\nbun run cli add button --cwd ../my-app')
    expect(html).toContain('id="call-chip"')
    expect(html).toContain('/r/call-chip.json')
    expect(html).toContain('bun run cli add call-chip')
    expect(html).toContain('Configure @/* to resolve to src/* in both TypeScript and Vite.')
    expect(html).toContain('The installer adds the button, class utility, theme, and npm dependencies.')
  })
})
