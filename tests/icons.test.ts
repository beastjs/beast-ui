import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { buildIcon, buildIcons, findUnused, listIcons } from '../scripts/build-icons.ts'
import { migrateIcons, previewPage } from '../scripts/migrate-icons.ts'
import { iconNames } from '../scripts/lib/prompt.ts'
import { createBeastProgram } from '../scripts/preview-gen/program.ts'
import { icons } from '../packages/icons/src/icons.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const svg = (attributes: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`
const square = '<path d="M0 0h2v2H0z"/>'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn() })
async function temp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beast-ui-icons-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

// The typecheck scripts do not read .btsx files, so this is what checks Icon and its props.
function typeErrors(file: string, source?: string): string[] {
  const { program, sourceFile } = createBeastProgram(root, [file], source === undefined ? undefined : new Map([[file, source]]))
  const compiled = sourceFile(file)
  if (!compiled) return [`Cannot load ${file}`]
  return [...program.getSyntacticDiagnostics(compiled), ...program.getSemanticDiagnostics(compiled)].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe('build-icons', () => {
  test('packages/icons/src/icons.ts matches the .svg files', async () => {
    const output = path.join(root, 'packages/icons/src/icons.ts')
    expect(await readFile(output, 'utf8')).toBe(await buildIcons(path.join(root, 'packages/icons/svg'), output))
  })

  test('redraws art on the 24px grid, stroke widths included', () => {
    expect(buildIcon('box', svg('viewBox="0 0 16 16"', '<path d="M0 0h16v16H0z"/>'))).toBe('<path d="M0 0h24v24H0z"/>')
    expect(buildIcon('offset', svg('viewBox="8 8 12 12"', '<path d="M8 8h12v12H8z"/>'))).toBe('<path d="M0 0h24v24H0z"/>')
    expect(buildIcon('rule', svg('viewBox="0 0 12 12"', '<path fill="none" stroke="currentColor" d="M0 6h12"/>'))).toContain('stroke-width="2"')
  })

  test('centers a wide or tall icon in the square', () => {
    expect(buildIcon('wide', svg('viewBox="0 0 32 16"', '<path d="M0 0h32v16H0z"/>'))).toBe('<path d="M0 6h24v12H0z"/>')
    expect(buildIcon('tall', svg('viewBox="0 0 12 24"', '<path d="M0 0h12v24H0z"/>'))).toBe('<path d="M6 0h12v24H6z"/>')
  })

  test('keeps paint set on the root <svg>', () => {
    const body = buildIcon('plus', svg('viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"', '<path d="M4 12h16"/><path d="M12 4v16"/>'))
    expect(body).toContain('fill="none"')
    expect(body).toContain('stroke="currentColor"')
    expect(body).toContain('stroke-width="2"')
  })

  test('draws in the text color, unless the icon keeps its colors', () => {
    const source = svg('viewBox="0 0 24 24"', '<path fill="none" stroke="oklch(14.5% 0 0)" d="m6 9 6 6 6-6"/><path fill="#f00" d="M0 0h2v2H0z"/>')
    const body = buildIcon('chevron', source)
    expect(body).not.toMatch(/oklch|#f00/)
    expect(body).toContain('fill="none" stroke="currentColor"')
    expect(buildIcon('chevron', source, { keepColors: true })).toContain('fill="red"')
  })

  test('leaves the shapes of an animated icon alone', () => {
    const body = buildIcon('pulse', svg('viewBox="0 0 12 12"', '<circle id="c" cx="6" cy="6" r="0" transform="matrix(0 0 0 0 6 6)"><animate attributeName="r" values="0;6" dur="1s" begin="0;c.end"/></circle>'))
    expect(body).toBe('<g transform="scale(2)"><circle id="pulse-c" cx="6" cy="6" r="0" transform="matrix(0 0 0 0 6 6)"><animate attributeName="r" values="0;6" dur="1s" begin="0; pulse-c.end"/></circle></g>')
  })

  test('drops editor leftovers', () => {
    expect(buildIcon('dot', svg('viewBox="0 0 24 24"', '<path font-size="18" transform-origin="0 0" d="M0 0h2v2H0z"/>'))).toBe(square)
  })

  test('prefixes ids with the icon name', () => {
    const body = buildIcon('faded', svg('viewBox="0 0 24 24"', '<defs><linearGradient id="g"><stop offset="0"/><stop offset="1" stop-opacity="0"/></linearGradient></defs><path fill="url(#g)" d="M0 0h24v24H0z"/>'))
    const id = body.match(/ id="([^"]+)"/)?.[1]
    expect(id).toStartWith('faded-')
    expect(body).toContain(`url(#${id})`)
  })

  test('accepts the names older apps use, and refuses what it cannot draw', () => {
    for (const name of ['re-up.ph', '3d-box-light', 'strength_', '36']) expect(buildIcon(name, svg('viewBox="0 0 24 24"', square))).toBe(square)
    expect(() => buildIcon('Bad_Name', svg('viewBox="0 0 24 24"', square))).toThrow('not a valid icon name')
    expect(() => buildIcon('+', svg('viewBox="0 0 24 24"', square))).toThrow('not a valid icon name')
    expect(() => buildIcon('bare', '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2v2H0z"/></svg>')).toThrow('needs a viewBox')
    expect(() => buildIcon('tilted', svg('viewBox="0 0 24 24"', '<path transform-origin="12 12" transform="rotate(45)" d="M0 0h2v2H0z"/>'))).toThrow('transform-origin')
    expect(() => buildIcon('empty', svg('viewBox="0 0 24 24"', ''))).toThrow('nothing to draw')
    expect(() => buildIcon('open', svg('viewBox="0 0 24 24"', `<g>${square}`))).toThrow('open.svg is not well-formed SVG: Unexpected close tag at line 1')
  })

  test('reads the color/ subfolder, quotes keys that are not identifiers, and refuses a name in both places', async () => {
    const dir = await temp()
    await mkdir(path.join(dir, 'svg/color'), { recursive: true })
    await writeFile(path.join(dir, 'svg/menu.svg'), svg('viewBox="0 0 24 24"', square))
    await writeFile(path.join(dir, 'svg/re-up.ph.svg'), svg('viewBox="0 0 24 24"', square))
    await writeFile(path.join(dir, 'svg/color/brand.svg'), svg('viewBox="0 0 24 24"', '<path fill="#f00" d="M0 0h2v2H0z"/>'))
    expect((await listIcons(path.join(dir, 'svg'))).map(({ name, keepColors }) => [name, keepColors])).toEqual([['brand', true], ['menu', false], ['re-up.ph', false]])
    const source = await buildIcons(path.join(dir, 'svg'), path.join(dir, 'src/icons.ts'))
    expect(source).toContain('// Generated by build-icons.ts from ../svg.')
    expect(source).toContain(`  brand: '<path fill="red" d="M0 0h2v2H0z"/>',`)
    expect(source).toContain(`  menu: '${square}',`)
    expect(source).toContain(`  're-up.ph': '${square}',`)
    await writeFile(path.join(dir, 'svg/color/menu.svg'), svg('viewBox="0 0 24 24"', square))
    await expect(listIcons(path.join(dir, 'svg'))).rejects.toThrow('menu.svg is in both')
    await expect(listIcons(path.join(dir, 'missing'))).rejects.toThrow('does not exist')
  })

  test('lists icons whose name never appears in quotes', async () => {
    const dir = await temp()
    await mkdir(path.join(dir, 'src/node_modules/pkg'), { recursive: true })
    await writeFile(path.join(dir, 'src/page.tsx'), `<Icon name="menu" />\nconst nav = [{ icon: 'folder' }]\nconst x = \`close\``)
    await writeFile(path.join(dir, 'src/node_modules/pkg/index.js'), `'search'`)
    await writeFile(path.join(dir, 'src/icons.ts'), `export const icons = { 'unused': '' }`)
    expect(await findUnused(['close', 'folder', 'menu', 'search', 'unused'], path.join(dir, 'src'), [path.join(dir, 'src/icons.ts')])).toEqual(['search', 'unused'])
  })
})

describe('Icon', () => {
  test('Icon.btsx compiles and typechecks', () => {
    expect(typeErrors(path.join(root, 'packages/icons/src/Icon.btsx'))).toEqual([])
  }, 30_000)

  test('a call site cannot name an icon that does not exist', () => {
    const file = path.join(root, 'apps/web/src/components/icon-probe.btsx')
    const errors = typeErrors(file, 'import { Icon } from "@beast-ui/icons"\n\ndiv\n  Icon(name="search")\n  Icon(name="serach")\n')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('"serach"')
  }, 30_000)

  test('the showcase tools offer every icon', async () => {
    expect(await iconNames(root)).toEqual(Object.keys(icons).sort())
  })
})

describe('migrate-icons', () => {
  test('writes one .svg per icon, sorting out the ones that keep their colors', async () => {
    const dir = await temp()
    const squeezed = '<g transform="scale(0.667)"><path d="M3 3h18v18H3z"/></g>'
    await writeFile(path.join(dir, 'icons.ts'), `export const icons = {
  menu: { symbol: ${JSON.stringify(squeezed)}, viewBox: '0 0 16 16', set: 'svg' },
  arrow: { symbol: '<path fill="none" stroke="currentColor" d="M4 12h16"/>', viewBox: '0 0 24 24', set: 'mingcute' },
  '+': { symbol: '${square}', viewBox: '0 0 24 24', set: 'svg' },
  images: { symbold: '${square}', viewBox: '0 0 24 24' },
}
export type IconName = keyof typeof icons
export const unrelated = { size: 16 }\n`)
    await writeFile(path.join(dir, 'logos.ts'), `export const logos = {
  brand: { symbol: '<path fill="url(#a)" d="M0 0h32v16H0z"/><defs><linearGradient id="a"><stop stop-color="#f00"/></linearGradient></defs>', viewBox: '0 0 32 16' },
  arrow: { symbol: '${square}', viewBox: '0 0 24 24' },
}\n`)
    const { written, skipped } = await migrateIcons(path.join(dir, 'svg'), [path.join(dir, 'icons.ts'), path.join(dir, 'logos.ts')])
    expect(written.map(({ name, keepColors }) => [name, keepColors])).toEqual([['arrow', false], ['brand', true], ['menu', false]])
    expect(skipped.map(({ name }) => name).sort()).toEqual(['+', 'arrow', 'images'])
    expect(skipped.find(({ name }) => name === 'images')?.reason).toBe('has no symbol string in icons in icons.ts. Its keys: symbold, viewBox.')
    expect(skipped.find(({ name }) => name === 'arrow')?.reason).toContain('is in both icons in icons.ts and logos in logos.ts')
    expect((await readdir(path.join(dir, 'svg'))).sort()).toEqual(['arrow.svg', 'color', 'menu.svg'])
    expect(await readFile(path.join(dir, 'svg/menu.svg'), 'utf8')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v18H3z"/></svg>\n')
    expect(await readFile(path.join(dir, 'svg/arrow.svg'), 'utf8')).toStartWith('<!-- mingcute -->\n<svg')
    expect(await readdir(path.join(dir, 'svg/color'))).toEqual(['brand.svg'])
    expect(previewPage(written)).toContain('"name":"brand"')

    const again = await migrateIcons(path.join(dir, 'svg'), [path.join(dir, 'icons.ts')])
    expect(again.written).toEqual([])
    expect(again.skipped.find(({ name }) => name === 'menu')?.reason).toContain('already exists')
  })
})
