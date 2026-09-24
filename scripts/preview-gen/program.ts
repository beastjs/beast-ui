import { readFileSync } from 'node:fs'
import path from 'node:path'
import { compileBeast } from 'beast-tsrx'
import { compileToVolarMappings as compileTsrxUntyped } from 'octane/compiler/volar'
import ts from 'typescript'

const compileTsrx = compileTsrxUntyped as (source: string, filename: string, options: { loose: boolean }) => { code: string }

// .btsx and .tsrx files are loaded as `<file>.tsx`, compiled the way the language tools do.
const COMPILED = /\.(?:btsx|tsrx)\.tsx$/

export interface BeastProgram {
  program: ts.Program
  checker: ts.TypeChecker
  /** The compiled source file for a .btsx or .tsrx path. */
  sourceFile: (file: string) => ts.SourceFile | undefined
}

/**
 * A TypeScript program that understands .btsx (Beast) and .tsrx (Octane) files, with the
 * `@/` alias resolved per workspace package. `overrides` maps absolute paths to in-memory sources.
 */
export function createBeastProgram(root: string, entries: string[], overrides: Map<string, string> = new Map()): BeastProgram {
  const aliases: [dir: string, target: string][] = [
    [path.join(root, 'packages/registry'), path.join(root, 'packages/registry')],
    [path.join(root, 'apps/web'), path.join(root, 'apps/web/src')],
  ]
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, noEmit: true, skipLibCheck: true, allowImportingTsExtensions: true, jsx: ts.JsxEmit.Preserve,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [],
  }
  const host = ts.createCompilerHost(options)
  const read = (file: string) => overrides.get(file) ?? readFileSync(file, 'utf8')
  const compiled = new Map<string, string>()
  const compile = (file: string): string => {
    const cached = compiled.get(file)
    if (cached !== undefined) return cached
    const original = file.slice(0, -'.tsx'.length)
    let source = read(original)
    if (original.endsWith('.btsx')) source = compileBeast(source, { filename: path.basename(original) })
    const code = compileTsrx(source, original.replace(/\.btsx$/, '.tsrx'), { loose: true }).code
    compiled.set(file, code)
    return code
  }

  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file, language, onError) =>
    COMPILED.test(file) ? ts.createSourceFile(file, compile(file), language, true, ts.ScriptKind.TSX) : getSourceFile(file, language, onError)
  const fileExists = host.fileExists.bind(host)
  const exists = (file: string) => overrides.has(file) || ts.sys.fileExists(file)
  host.fileExists = (file) => (COMPILED.test(file) ? exists(file.slice(0, -'.tsx'.length)) : fileExists(file))

  const compiledModule = (file: string): ts.ResolvedModuleFull | undefined =>
    exists(file) ? { resolvedFileName: `${file}.tsx`, extension: ts.Extension.Tsx, isExternalLibraryImport: false } : undefined
  host.resolveModuleNameLiterals = (literals, containingFile) => literals.map(({ text }) => {
    const containing = containingFile.replace(/\.tsx$/, '')
    let specifier = text
    if (specifier.startsWith('@/')) {
      const alias = aliases.find(([dir]) => containing.startsWith(`${dir}${path.sep}`))
      if (alias) specifier = path.join(alias[1], specifier.slice(2))
    }
    const registryUi = /^@beast-ui\/registry\/ui\/([a-z0-9-]+)$/.exec(specifier)
    if (registryUi) return { resolvedModule: compiledModule(path.join(root, 'packages/registry/ui', `${registryUi[1]}.btsx`)) }
    if (/\.(?:btsx|tsrx)$/.test(specifier) && (specifier.startsWith('.') || path.isAbsolute(specifier))) {
      return { resolvedModule: compiledModule(path.resolve(path.dirname(containing), specifier)) }
    }
    return ts.resolveModuleName(specifier, containing, options, host)
  })

  const program = ts.createProgram(entries.map((file) => `${file}.tsx`), options, host)
  return { program, checker: program.getTypeChecker(), sourceFile: (file) => program.getSourceFile(`${file}.tsx`) }
}
