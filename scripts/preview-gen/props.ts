import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'beast-tsrx'
import ts from 'typescript'
import { createBeastProgram } from './program.ts'

export type PropKind =
  | { type: 'union'; values: string[] } // string literals, e.g. a cva variant
  | { type: 'boolean' }
  | { type: 'number' }
  | { type: 'string' }
  | { type: 'handler'; parameter?: string } // on* callback; parameter is its first argument's type
  | { type: 'children' }
  | { type: 'other'; text: string }

export interface PropInfo {
  name: string
  required: boolean
  kind: PropKind
  /** Default from the component's props destructuring, as written. */
  defaultValue?: string
}

export interface ComponentProps {
  /** Props the preview can meaningfully set; inherited DOM attributes are left out. */
  props: PropInfo[]
  acceptsChildren: boolean
}

// Inherited attributes worth offering even though a library declares them.
const COMMON = new Set(['children', 'disabled', 'onClick', 'checked', 'onCheckedChange', 'open', 'onOpenChange', 'placeholder'])
const SKIPPED = new Set(['className', 'style', 'id', 'ref', 'key'])

/** Splits `{ a = 1, ...rest }: Type` into its binding pattern and type. */
export function splitParameter(parameter: string): { pattern: string; type: string } {
  let depth = 0
  for (let index = 0; index < parameter.length; index++) {
    const char = parameter[index]
    if (char === '{' || char === '(' || char === '[' || char === '<') depth++
    else if (char === '}' || char === ')' || char === ']' || char === '>') depth--
    else if (char === ':' && depth === 0) return { pattern: parameter.slice(0, index).trim(), type: parameter.slice(index + 1).trim() }
  }
  return { pattern: parameter.trim(), type: 'Record<string, never>' }
}

/** Defaults from a destructuring pattern: `{ size = "md", label }` → size: "md". */
export function patternDefaults(pattern: string): Map<string, string> {
  const defaults = new Map<string, string>()
  const inner = pattern.trim().replace(/^\{/, '').replace(/\}$/, '')
  let depth = 0
  let start = 0
  const parts: string[] = []
  for (let index = 0; index <= inner.length; index++) {
    const char = inner[index]
    if (index === inner.length || (char === ',' && depth === 0)) { parts.push(inner.slice(start, index)); start = index + 1; continue }
    if ('{([<'.includes(char)) depth++
    else if ('})]>'.includes(char)) depth--
    else if ((char === '"' || char === "'" || char === '`')) {
      const close = inner.indexOf(char, index + 1)
      if (close !== -1) index = close
    }
  }
  for (const part of parts) {
    const match = /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*[A-Za-z_$][\w$]*\s*)?=\s*([\s\S]+?)\s*$/.exec(part)
    if (match) defaults.set(match[1], match[2])
  }
  return defaults
}

const describeKind = (checker: ts.TypeChecker, type: ts.Type, name: string): PropKind => {
  const parts = (type.isUnion() ? type.types : [type]).filter((part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))
  if (name === 'children') return { type: 'children' }
  if (parts.length && parts.every((part) => part.isStringLiteral())) return { type: 'union', values: parts.map((part) => (part as ts.StringLiteralType).value) }
  if (parts.length && parts.every((part) => part.flags & ts.TypeFlags.BooleanLike)) return { type: 'boolean' }
  if (parts.length === 1 && parts[0].flags & ts.TypeFlags.NumberLike) return { type: 'number' }
  if (parts.length === 1 && parts[0].flags & ts.TypeFlags.StringLike) return { type: 'string' }
  const signature = parts.flatMap((part) => part.getCallSignatures())[0]
  if (signature) {
    const first = signature.getParameters()[0]
    const parameter = first ? checker.typeToString(checker.getTypeOfSymbol(first)) : undefined
    return { type: 'handler', parameter }
  }
  return { type: 'other', text: checker.typeToString(type) }
}

/** Resolves the props of a registry UI component with the TypeScript checker. */
export function analyzeProps(root: string, name: string): ComponentProps {
  const file = path.join(root, 'packages/registry/ui', `${name}.btsx`)
  const { checker, sourceFile } = createBeastProgram(root, [file])
  const module = sourceFile(file)
  const moduleSymbol = module && checker.getSymbolAtLocation(module)
  const component = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.getName() === 'default')
  const signature = component && checker.getTypeOfSymbol(component).getCallSignatures()[0]
  if (!signature) throw new Error(`Cannot read the props of ${name}: it has no default export component.`)
  const parameter = signature.getParameters()[0]
  // A component without a props declaration takes no props.
  if (!parameter) return { props: [], acceptsChildren: false }
  const propsType = checker.getTypeOfSymbol(parameter)

  const declaration = parse(readFileSync(file, 'utf8'), path.basename(file)).declarations.find((entry) => entry.kind === 'props')
  const defaults = patternDefaults(splitParameter(declaration?.kind === 'props' ? declaration.parameter : '{}').pattern)
  const registry = path.join(root, 'packages/registry') + path.sep
  // Props the registry declares, including cva variants; inherited DOM attributes are not.
  const local = (symbol: ts.Symbol) => (symbol.getDeclarations() ?? []).some((entry) => entry.getSourceFile().fileName.startsWith(registry))

  const props: PropInfo[] = []
  let acceptsChildren = false
  for (const symbol of checker.getPropertiesOfType(checker.getApparentType(propsType))) {
    const propName = symbol.getName()
    if (propName === 'children') acceptsChildren = true
    if (SKIPPED.has(propName) || (!local(symbol) && !COMMON.has(propName))) continue
    props.push({
      name: propName,
      required: (symbol.getFlags() & ts.SymbolFlags.Optional) === 0,
      kind: describeKind(checker, checker.getTypeOfSymbol(symbol), propName),
      defaultValue: defaults.get(propName),
    })
  }
  return { props, acceptsChildren }
}
