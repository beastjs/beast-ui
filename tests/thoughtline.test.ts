import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileBeast } from 'beast-tsrx'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createBeastProgram } from '../scripts/preview-gen/program.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const file = path.join(root, 'apps/web/src/components/ui/ThoughtLine.btsx')

function diagnostics(entry: string): string[] {
  const { program, sourceFile } = createBeastProgram(root, [entry])
  const compiled = sourceFile(entry)
  if (!compiled) return [`Cannot load ${entry}`]
  return [...program.getSyntacticDiagnostics(compiled), ...program.getSemanticDiagnostics(compiled)]
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

describe('ThoughtLine', () => {
  test('compiles without Beast syntax errors', async () => {
    const source = await readFile(file, 'utf8')
    expect(() => compileBeast(source, { filename: 'ThoughtLine.btsx' })).not.toThrow()
  })

  test('typechecks with its icon and motion imports', () => {
    expect(diagnostics(file)).toEqual([])
  })

  test('renders bare from Home without prop errors', async () => {
    const home = path.join(root, 'apps/web/src/pages/Home.btsx')
    const source = await readFile(home, 'utf8')
    expect(source).toContain('ThoughtLine')
    expect(diagnostics(home)).toEqual([])
  })
})
