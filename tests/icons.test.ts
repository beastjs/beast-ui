import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { buildIcon, buildIcons } from '../scripts/build-icons.ts'
import { iconNames } from '../scripts/lib/prompt.ts'
import { createBeastProgram } from '../scripts/preview-gen/program.ts'
import { icons } from '../packages/icons/src/icons.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const svg = (attributes: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`
const square = '<path d="M0 0h2v2H0z"/>'

// The typecheck scripts do not read .btsx files, so this is what checks Icon and its props.
function typeErrors(file: string, source?: string): string[] {
  const { program, sourceFile } = createBeastProgram(root, [file], source === undefined ? undefined : new Map([[file, source]]))
  const compiled = sourceFile(file)
  if (!compiled) return [`Cannot load ${file}`]
  return [...program.getSyntacticDiagnostics(compiled), ...program.getSemanticDiagnostics(compiled)].map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

describe('icons', () => {
  test('src/icons.ts matches the .svg files', async () => {
    expect(await readFile(path.join(root, 'packages/icons/src/icons.ts'), 'utf8')).toBe(await buildIcons(root))
  })

  test('redraws art on the 24px grid, stroke widths included', () => {
    expect(buildIcon('box', svg('viewBox="0 0 16 16"', '<path d="M0 0h16v16H0z"/>'))).toBe('<path d="M0 0h24v24H0z"/>')
    expect(buildIcon('offset', svg('viewBox="8 8 12 12"', '<path d="M8 8h12v12H8z"/>'))).toBe('<path d="M0 0h24v24H0z"/>')
    expect(buildIcon('rule', svg('viewBox="0 0 12 12"', '<path fill="none" stroke="currentColor" d="M0 6h12"/>'))).toContain('stroke-width="2"')
  })

  test('keeps paint set on the root <svg>', () => {
    const body = buildIcon('plus', svg('viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"', '<path d="M4 12h16"/><path d="M12 4v16"/>'))
    expect(body).toContain('fill="none"')
    expect(body).toContain('stroke="currentColor"')
    expect(body).toContain('stroke-width="2"')
  })

  test('draws in the text color', () => {
    const body = buildIcon('chevron', svg('viewBox="0 0 24 24"', '<path fill="none" stroke="oklch(14.5% 0 0)" d="m6 9 6 6 6-6"/><path fill="#000" d="M0 0h2v2H0z"/>'))
    expect(body).not.toMatch(/oklch|#000/)
    expect(body).toContain('fill="none" stroke="currentColor"')
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

  test('refuses icons it cannot draw', () => {
    expect(() => buildIcon('wide', svg('viewBox="0 0 32 16"', square))).toThrow('Icons must be square')
    expect(() => buildIcon('Bad_Name', svg('viewBox="0 0 24 24"', square))).toThrow('not a valid icon name')
    expect(() => buildIcon('tilted', svg('viewBox="0 0 24 24"', '<path transform-origin="12 12" transform="rotate(45)" d="M0 0h2v2H0z"/>'))).toThrow('transform-origin')
    expect(() => buildIcon('empty', svg('viewBox="0 0 24 24"', ''))).toThrow('nothing to draw')
  })

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
