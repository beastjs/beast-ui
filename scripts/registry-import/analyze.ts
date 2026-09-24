import { itemNameSchema } from '@beast-ui/registry/schema'

export interface CatalogEntry {
  name: string
  type: string
  dependencies: string[]
  registryDependencies: string[]
  variantOf?: string
}

export type ImportKind =
  | 'runtime' // octane itself; every Beast app already has it
  | 'utils' // @/lib/utils, the registry's class helper
  | 'component' // another registry UI item
  | 'package' // an npm package
  | 'unknown' // a path the installer cannot resolve in a user's project

export interface ParsedImport {
  specifier: string
  typeOnly: boolean
  kind: ImportKind
  /** Registry item or npm package name this import points at. */
  target?: string
  /** Specifier to write instead, when the original would break once installed. */
  rewriteTo?: string
}

export interface Analysis {
  content: string
  imports: ParsedImport[]
  registryDependencies: string[]
  /** npm packages to depend on, without version ranges. */
  packages: string[]
  suggestedName: string
  suggestedTitle: string
  suggestedVariantOf?: string
  warnings: string[]
}

const IMPORT = /^[ \t]*import\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/gm
// Tailwind utilities that read the registry theme's color tokens.
const THEME_TOKENS = /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|divide|placeholder|caret|accent)-(?:primary|secondary|muted|accent|destructive|foreground|background|border|input|ring|card|popover|sidebar)(?:-foreground)?\b/

export const toItemName = (fileName: string): string =>
  fileName.replace(/\.btsx$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()

export const toTitle = (name: string): string =>
  name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

export const toPascal = (name: string): string => toTitle(name).replace(/ /g, '')

/** The npm package an import specifier belongs to: `@scope/pkg/sub` → `@scope/pkg`. */
export const packageOf = (specifier: string): string => {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

export function parseImports(source: string, catalog: Map<string, CatalogEntry>, staged: Set<string>): ParsedImport[] {
  const known = (name: string) => catalog.get(name)?.type === 'registry:ui' || staged.has(name)
  const imports: ParsedImport[] = []
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[2]
    const typeOnly = match[1] !== undefined
    if (specifier === 'octane' || specifier.startsWith('octane/')) {
      imports.push({ specifier, typeOnly, kind: 'runtime' })
    } else if (specifier === '@/lib/utils' || /^(?:\.\.\/)+lib\/utils(?:\.ts)?$/.test(specifier)) {
      // The installer rewrites only the @/lib/utils alias, so relative paths to it must change.
      imports.push({ specifier, typeOnly, kind: 'utils', target: 'utils', rewriteTo: specifier === '@/lib/utils' ? undefined : '@/lib/utils' })
    } else {
      const component = /^(?:@\/components\/ui\/|\.\/)([a-z0-9-]+)(?:\.btsx)?$/i.exec(specifier)
      if (component && known(component[1])) {
        // Both files install into paths.ui, so a sibling path holds in the user's project.
        const relative = `./${component[1]}.btsx`
        imports.push({ specifier, typeOnly, kind: 'component', target: component[1], rewriteTo: specifier === relative ? undefined : relative })
      } else if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        imports.push({ specifier, typeOnly, kind: 'unknown' })
      } else {
        imports.push({ specifier, typeOnly, kind: 'package', target: packageOf(specifier) })
      }
    }
  }
  return imports
}

/** npm packages already installed by a set of registry dependencies, followed transitively. */
export function providedPackages(names: string[], catalog: Map<string, CatalogEntry>): Set<string> {
  const packages = new Set<string>()
  const seen = new Set<string>()
  const visit = (name: string) => {
    const entry = catalog.get(name)
    if (!entry || seen.has(name)) return
    seen.add(name)
    for (const dependency of entry.dependencies) packages.add(packageOf(dependency.replace(/@[^@/]+$/, '')))
    entry.registryDependencies.forEach(visit)
  }
  names.forEach(visit)
  return packages
}

export function analyzeComponent(fileName: string, source: string, catalog: Map<string, CatalogEntry>, staged: Set<string>): Analysis {
  const imports = parseImports(source, catalog, staged)
  let content = source
  for (const entry of imports) {
    if (entry.rewriteTo) content = content.replaceAll(`"${entry.specifier}"`, `"${entry.rewriteTo}"`).replaceAll(`'${entry.specifier}'`, `'${entry.rewriteTo}'`)
  }

  const registryDependencies = [...new Set(imports.flatMap((entry) => (entry.kind === 'utils' || entry.kind === 'component') && entry.target ? [entry.target] : []))]
  if (THEME_TOKENS.test(source) && !registryDependencies.includes('theme') && catalog.has('theme')) registryDependencies.push('theme')

  // Type-only imports of packages a registry dependency already installs add nothing.
  const provided = providedPackages(registryDependencies, catalog)
  const packages = [...new Set(imports.flatMap((entry) =>
    entry.kind === 'package' && entry.target && !(entry.typeOnly && provided.has(entry.target)) ? [entry.target] : []))]

  const suggestedName = toItemName(fileName)
  const warnings: string[] = []
  if (!itemNameSchema.safeParse(suggestedName).success) warnings.push(`${fileName} does not give a valid item name; choose one at the prompt.`)
  for (const entry of imports.filter((item) => item.kind === 'unknown')) {
    warnings.push(`Cannot resolve ${entry.specifier} in a user's project. Use @/lib/utils, a sibling ./<component>.btsx, or an npm package.`)
  }

  // A file named <base>-<something> that imports <base> is most likely its variant.
  const suggestedVariantOf = registryDependencies.find((name) =>
    catalog.get(name)?.type === 'registry:ui' && catalog.get(name)?.variantOf === undefined && suggestedName.startsWith(`${name}-`))

  return { content, imports, registryDependencies, packages, suggestedName, suggestedTitle: toTitle(suggestedName), suggestedVariantOf, warnings }
}
