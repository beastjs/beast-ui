import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paths, previewSource, readRegistry } from '../scripts/registry-import/apply.ts'
import { checkPreview } from '../scripts/preview-gen/check.ts'
import { booleanStatus, composePreview, controlledPairs, plural, valueStatus, type PreviewSpec } from '../scripts/preview-gen/compose.ts'
import { analyzeProps, patternDefaults, splitParameter } from '../scripts/preview-gen/props.ts'
import { previewStatus } from '../scripts/preview-gen/session.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
// Each check builds a TypeScript program over the component's imports.
const SLOW = 60_000

describe('preview props analysis', () => {
  test('splits a props parameter and reads its defaults', () => {
    const { pattern, type } = splitParameter('{ size = "md", label, onChange, style = { a: 1 }, ...rest }: Props<{ x: 1 }>')
    expect(type).toBe('Props<{ x: 1 }>')
    expect([...patternDefaults(pattern)]).toEqual([['size', '"md"'], ['style', '{ a: 1 }']])
  })

  test('resolves cva variants through the base component', () => {
    const props = new Map(analyzeProps(root, 'button-ripple').props.map((prop) => [prop.name, prop]))
    expect(props.get('variant')?.kind).toEqual({ type: 'union', values: ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] })
    expect(props.get('rippleDuration')).toMatchObject({ kind: { type: 'number' }, defaultValue: '550' })
    expect(props.has('disabled')).toBe(true)
    // Inherited DOM attributes and events stay out of the prompts.
    expect(props.has('onCopy')).toBe(false)
    expect(props.has('tabIndex')).toBe(false)
  }, SLOW)

  test('finds controlled value and handler pairs', () => {
    expect(controlledPairs(analyzeProps(root, 'squishy')).map((pair) => `${pair.prop.name}/${pair.handler.name}`)).toEqual(['checked/onChange'])
    expect(controlledPairs(analyzeProps(root, 'scrubfield')).map((pair) => `${pair.prop.name}/${pair.handler.name}`)).toEqual(['value/onChange'])
    expect(controlledPairs(analyzeProps(root, 'call-chip'))).toEqual([])
  }, SLOW)
})

describe('preview composition', () => {
  const spec = (overrides: Partial<PreviewSpec> = {}): PreviewSpec => ({
    name: 'button', component: 'Button', rows: [], base: '', label: 'Button', examples: [], note: 'A note.', ...overrides,
  })

  test('writes rows, a click counter, and extra examples that typecheck', () => {
    const source = composePreview(spec({
      state: { kind: 'counter', handler: 'onClick', idle: 'Try it.', noun: 'Clicked' },
      rows: [{ prop: 'variant', values: ['default', 'outline'] }, { prop: 'size', values: ['sm', 'lg'] }],
      examples: [{ attrs: 'variant="outline" disabled={true}', label: 'Disabled' }],
    }))
    expect(source).toContain('  const variants = ["default", "outline"] as const')
    expect(source).toContain('      Button(size={size} onClick={() => setCount(count + 1)}) #{size}')
    expect(source).toContain('    Button(variant="outline" disabled={true}) Disabled')
    expect(checkPreview(root, 'button', source)).toEqual([])
  }, SLOW)

  test('writes a controlled example with a status line that typechecks', () => {
    const source = composePreview(spec({
      name: 'squishy', component: 'Squishy', label: undefined, base: 'label="Alerts"',
      state: { kind: 'controlled', prop: 'checked', handler: 'onChange', initial: 'false', status: booleanStatus('checked', 'On.', 'Off.') },
      examples: [{ attrs: 'disabled={true}' }],
    }))
    expect(source).toContain('  const [checked, setChecked] = useState(false)')
    expect(source).toContain('  Squishy(checked={checked} onChange={setChecked} label="Alerts")')
    expect(source).toContain('#{checked ? "On." : "Off."}')
    expect(checkPreview(root, 'squishy', source)).toEqual([])
  }, SLOW)

  test('reports wrong prop values and Beast syntax errors', () => {
    const wrong = checkPreview(root, 'button', composePreview(spec({ examples: [{ attrs: 'variant="nope"', label: 'x' }] })))
    expect(wrong).toHaveLength(1)
    expect(wrong[0]).toContain(`Type '"nope"' is not assignable`)
    expect(checkPreview(root, 'button', 'props {}:{}\ndiv(className="x"\n')[0]).toContain('BEAST1201')
  }, SLOW)

  test('keeps text that looks like interpolation literal', () => {
    expect(composePreview(spec({ note: 'Use #{x}.' }))).toContain(') #{"Use #{x}."}')
    expect(valueStatus('opacity', 'Opacity: {value}% `raw` ${x}')).toBe('#{`Opacity: ${opacity}% \\`raw\\` \\${x}`}')
    expect(plural('status')).toBe('statuses')
    expect(plural('variant')).toBe('variants')
  })
})

describe('showcase previews', () => {
  // The web typecheck does not read .btsx files, so this is what type-checks the previews.
  test('every hand-written preview compiles and typechecks', async () => {
    for (const item of (await readRegistry(root)).items.filter((entry) => entry.type === 'registry:ui')) {
      const source = await readFile(path.join(root, paths.preview(item.name)), 'utf8')
      expect({ name: item.name, problems: checkPreview(root, item.name, source) }).toEqual({ name: item.name, problems: [] })
    }
  }, SLOW * 4)

  test('tells starter previews from hand-written ones', async () => {
    const registry = await readRegistry(root)
    const button = registry.items.find((item) => item.name === 'button')
    expect(await previewStatus(root, 'button', button?.description ?? '')).toBe('custom')
    expect(await previewStatus(root, 'not-a-component', '')).toBe('missing')
    expect(previewSource({ name: 'x', description: 'd' })).toContain('import X from "@beast-ui/registry/ui/x";')
  })
})
