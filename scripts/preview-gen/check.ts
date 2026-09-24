import path from 'node:path'
import { BeastCompileError, compileBeast } from 'beast-tsrx'
import ts from 'typescript'
import { paths } from '../registry-import/apply.ts'
import { createBeastProgram } from './program.ts'

/**
 * Problems with a preview before it is written: Beast syntax errors, then type errors against
 * the component's real props. The web typecheck does not cover .btsx files, so this is the check.
 */
export function checkPreview(root: string, name: string, source: string): string[] {
  const file = path.join(root, paths.preview(name))
  try {
    compileBeast(source, { filename: path.basename(file) })
  } catch (error) {
    return [error instanceof BeastCompileError || error instanceof Error ? error.message : String(error)]
  }
  const { program, sourceFile } = createBeastProgram(root, [file], new Map([[file, source]]))
  const compiled = sourceFile(file)
  if (!compiled) return [`Cannot load ${paths.preview(name)}.`]
  return [...program.getSyntacticDiagnostics(compiled), ...program.getSemanticDiagnostics(compiled)].map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    if (diagnostic.start === undefined) return message
    // Positions point into the compiled TSX, so quote the code around the error.
    const at = diagnostic.start
    const code = compiled.text.slice(Math.max(0, at - 30), at + 70).replace(/\s+/g, ' ').trim()
    return `${message}\n  near: …${code}…`
  })
}
