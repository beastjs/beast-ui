/// <reference types="bun" />

import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import type { ComponentBody, Root } from 'octane'
import { createRunnableDevEnvironment, createServer, type Plugin, type RunnableDevEnvironment, type ViteDevServer } from 'vite'

type OctaneRuntime = Pick<typeof import('octane'), 'createRoot' | 'flushSync'>
interface ComponentModule { default: ComponentBody }

// The DOM environment has no HMR socket, so stub Vite's client. The virtual
// runtime module re-exports octane through Vite's resolver, giving the test the
// same octane instance the compiled components import.
const domTestModules: Plugin = {
  name: 'dom-test-modules',
  enforce: 'pre',
  resolveId: (id) => id === 'virtual:octane-runtime' ? '\0octane-runtime'
    : id === '/@vite/client' || id.endsWith('/vite/dist/client/client.mjs') ? '\0vite-client-stub' : undefined,
  load: (id) => id === '\0octane-runtime' ? "export { createRoot, flushSync } from 'octane'"
    : id === '\0vite-client-stub'
      // Each module needs its own hot.data: octane's HMR wrappers are keyed on it.
      ? 'export const createHotContext = () => ({ data: {}, accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {} })\n' +
        'export const updateStyle = () => {}\nexport const removeStyle = () => {}\nexport const injectQuery = (url) => url'
      : undefined,
}

let server: ViteDevServer
let dom: RunnableDevEnvironment
const roots: Root[] = []
beforeAll(async () => {
  // Keep the host timers: Vite's dev server relies on Node timer handles.
  const timers = { setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask }
  GlobalRegistrator.register()
  Object.assign(globalThis, timers)
  server = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [domTestModules],
    environments: {
      // Compiled for the browser, like the docs site, but runnable in-process.
      dom: { consumer: 'client', optimizeDeps: { noDiscovery: true }, dev: { moduleRunnerTransform: true, createEnvironment: (name, config) => createRunnableDevEnvironment(name, config, { runnerOptions: { hmr: false } }) } },
    },
  })
  dom = server.environments.dom as RunnableDevEnvironment
  // Compile octane's client runtime once, outside any single test's timeout.
  await dom.runner.import<OctaneRuntime>('virtual:octane-runtime')
}, 60_000)
afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  document.body.replaceChildren()
})
afterAll(async () => {
  await server?.close()
  await GlobalRegistrator.unregister()
})

// @octanejs/motion needs octane's client context runtime, so motion components
// (and the docs page that previews them) are verified in a DOM, not with SSR.
async function mount(specifier: string, props?: Record<string, unknown>): Promise<HTMLElement> {
  const { createRoot, flushSync } = await dom.runner.import<OctaneRuntime>('virtual:octane-runtime')
  const { default: Component } = await dom.runner.import<ComponentModule>(specifier)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  flushSync(() => root.render(Component, props ?? {}))
  return container
}

describe('rendered components', () => {
  test('new previews render compound components and preserve their interactions', async () => {
    const { flushSync } = await dom.runner.import<OctaneRuntime>('virtual:octane-runtime')
    const preview = (name: string) => fileURLToPath(new URL(`../../web/src/previews/${name}-preview.btsx`, import.meta.url))
    const button = (container: HTMLElement, text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === text)!
    const settle = () => new Promise(resolve => setTimeout(resolve, 0))
    const accordion = await mount(preview('accordion'))
    expect(accordion.textContent).toContain('Yes. Components are copied')
    flushSync(() => button(accordion, 'Can I change the theme?').click())
    expect(button(accordion, 'Can I change the theme?').getAttribute('aria-expanded')).toBe('true')
    expect(button(accordion, 'Do I own the source?').getAttribute('aria-expanded')).toBe('false')

    const dialog = await mount(preview('alert-dialog'))
    flushSync(() => button(dialog, 'Archive project').click())
    await settle()
    const cancel = Array.from(document.querySelectorAll('button')).find(node => node.textContent?.trim() === 'Keep project')!
    expect(cancel).toBeDefined()
    flushSync(() => cancel.click())
    await settle()
    expect(button(dialog, 'Archive project').getAttribute('aria-expanded')).toBe('false')
    expect(dialog.textContent).toContain('Your project is still active.')

    const attachment = await mount(preview('attachment'))
    flushSync(() => attachment.querySelector<HTMLButtonElement>('[aria-label="Remove project brief"]')!.click())
    expect(attachment.textContent).toContain('Project brief removed')
    flushSync(() => attachment.querySelector<HTMLButtonElement>('[aria-label="Retry upload"]')!.click())
    expect(attachment.textContent).toContain('Upload complete')

    const inputGroup = await mount(preview('input-group'))
    const textarea = inputGroup.querySelector('textarea')!
    flushSync(() => {
      textarea.value = 'A useful next idea'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button(inputGroup, 'Send').disabled).toBe(false)
    flushSync(() => button(inputGroup, 'Send').click())
    expect(inputGroup.textContent).toContain('Sent: A useful next idea')
    expect(textarea.value).toBe('')

    const combobox = await mount(preview('combobox'))
    const picker = combobox.querySelector<HTMLInputElement>('input[role="combobox"]')!
    expect(picker.id).not.toBe('')
    flushSync(() => combobox.querySelector<HTMLButtonElement>('[aria-label="Show options"]')!.click())
    await settle()
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(node => node.textContent?.trim() === 'Octane')!
    expect(option).toBeDefined()
    flushSync(() => option.click())
    await settle()
    expect(combobox.textContent).toContain('Selected: Octane')
    flushSync(() => combobox.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!.click())
    expect(combobox.textContent).toContain('Type to filter')
  }, 60_000)

  test('message scroller follows the bottom and preserves a reader’s position above it', async () => {
    const { flushSync } = await dom.runner.import<OctaneRuntime>('virtual:octane-runtime')
    const container = await mount(fileURLToPath(new URL('../../web/src/previews/message-scroller-preview.btsx', import.meta.url)))
    const viewport = container.querySelector<HTMLDivElement>('[data-slot="message-scroller-viewport"]')!
    const button = (text: string) => Array.from(container.querySelectorAll('button')).find(node => node.textContent?.trim() === text)!
    // Happy DOM has no layout. Supply a viewport whose height grows with its messages.
    Object.defineProperty(viewport, 'clientHeight', { get: () => 200 })
    Object.defineProperty(viewport, 'scrollHeight', { get: () => viewport.querySelectorAll('[data-message-id]').length * 60 })
    viewport.scrollTo = ((options: ScrollToOptions) => {
      viewport.scrollTop = Math.max(0, Math.min(options.top ?? 0, viewport.scrollHeight - viewport.clientHeight))
      viewport.dispatchEvent(new Event('scroll'))
    }) as typeof viewport.scrollTo
    flushSync(() => viewport.dispatchEvent(new Event('scroll')))
    flushSync(() => button('Add message').click())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(viewport.scrollTop).toBe(0)
    expect(container.querySelectorAll('[data-message-id]')).toHaveLength(9)
    flushSync(() => button('Latest message').click())
    expect(viewport.scrollTop).toBe(340)
    flushSync(() => button('Add message').click())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(viewport.scrollTop).toBeGreaterThanOrEqual(400)
    flushSync(() => button('First message').click())
    expect(viewport.scrollTop).toBe(0)
    expect(container.querySelector('[data-direction="end"]')?.getAttribute('data-active')).toBe('true')
  }, 30_000)

  test('motion components render with defaults and explicit props', async () => {
    const field = (await mount('@beast-ui/registry/ui/scrubfield')).innerHTML
    expect(field).toContain('role="spinbutton"')
    expect(field).toContain('aria-valuenow="0"')
    expect(field).not.toMatch(/NaN|undefinedpx/)
    const customField = (await mount('@beast-ui/registry/ui/scrubfield', { label: 'Opacity', value: 50, suffix: '%', disabled: true })).innerHTML
    expect(customField).toContain('Opacity')
    expect(customField).toContain('aria-valuenow="50"')
    expect(customField).toContain('aria-valuetext="50 %"')
    expect(customField).toContain('disabled')
    const toggle = (await mount('@beast-ui/registry/ui/squishy')).innerHTML
    expect(toggle).toContain('role="switch"')
    expect(toggle).toContain('aria-checked="false"')
    expect(toggle).not.toMatch(/NaN|undefinedpx/)
    const customToggle = await mount('@beast-ui/registry/ui/squishy', { checked: true, label: 'Notifications', disabled: true })
    expect(customToggle.innerHTML).toContain('aria-checked="true"')
    expect(customToggle.innerHTML).toContain('Notifications')
    expect(customToggle.querySelector('button')?.disabled).toBe(true)
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
    const html = (await mount('/src/App.btsx')).innerHTML
    expect(html).toContain('http://127.0.0.1:5173/r\nbun run cli add button --cwd ../my-app --dry-run\nbun run cli add button --cwd ../my-app')
    expect(html).toContain('id="call-chip"')
    expect(html).toContain('/r/call-chip.json')
    expect(html).toContain('bun run cli add call-chip')
    expect(html).toContain('Configure @/* to resolve to src/* in both TypeScript and Vite.')
    expect(html).toContain('The installer adds the button, class utility, theme, and npm dependencies.')
  }, 30_000) // First load compiles the whole docs page.
})
