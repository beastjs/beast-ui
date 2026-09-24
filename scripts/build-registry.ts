import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrySchema, type Registry } from '@beast-ui/registry/schema'
import { safePath } from '@beast-ui/registry/node'

const sourceRoots = { 'registry:ui': 'ui', 'registry:lib': 'lib', 'registry:style': 'styles' } as const
const relativeImport = /(?:\bfrom\s*|\bimport\s*\(?\s*|@import\s+(?:url\(\s*)?)["'](\.{1,2}\/[^"']*)["']/g

// A relative import that climbs out of its type's install root would point at a
// directory the consuming project does not have. Cross-root imports must use an alias.
export function assertContainedImports(file: { path: string; type: keyof typeof sourceRoots; content: string }) {
  const kind = sourceRoots[file.type]
  const prefix = [`packages/registry/${kind}/`, `${kind}/`].find((value) => file.path.startsWith(value)) ?? ''
  const directory = path.posix.dirname(file.path.slice(prefix.length))
  for (const [, specifier] of file.content.matchAll(relativeImport)) {
    if (path.posix.normalize(path.posix.join(directory, specifier)).startsWith('../')) {
      throw new Error(`${file.path} imports ${specifier}, which leaves the ${kind} install root. Use an alias such as @/lib/utils.`)
    }
  }
}

export async function buildRegistry(root: string, output: string): Promise<Registry> {
  const registry = registrySchema.parse(JSON.parse(await readFile(path.join(root, 'registry.json'), 'utf8')))
  const items = new Map(registry.items.map((item) => [item.name, item]))
  if (items.size !== registry.items.length) throw new Error('Registry item names must be unique')
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(name: string) {
    if (visiting.has(name)) throw new Error(`Circular registry dependency: ${name}`)
    if (visited.has(name)) return
    const item = items.get(name)
    if (!item) throw new Error(`Unknown registry dependency: ${name}`)
    visiting.add(name)
    item.registryDependencies.forEach(visit)
    visiting.delete(name)
    visited.add(name)
  }
  registry.items.forEach((item) => visit(item.name))
  for (const item of registry.items) {
    const base = item.meta?.variantOf
    if (base === undefined) continue
    const target = items.get(base)
    if (!target) throw new Error(`${item.name} is a variant of unknown item ${base}`)
    if (item.type !== 'registry:ui' || target.type !== 'registry:ui') throw new Error(`${item.name} and ${base} must both be registry:ui items to form a variant`)
    if (target.meta?.variantOf !== undefined) throw new Error(`${item.name} cannot be a variant of ${base}, which is itself a variant`)
    if (!item.registryDependencies.includes(base)) throw new Error(`${item.name} must list its base ${base} in registryDependencies`)
  }
  // Read and validate the entire catalog before replacing any published output.
  for (const item of registry.items) {
    for (const file of item.files) {
      const content = await readFile(await safePath(root, file.path), 'utf8')
      assertContainedImports({ path: file.path, type: file.type, content })
      file.content = content
    }
  }
  await rm(output, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  for (const item of registry.items) {
    await writeFile(path.join(output, `${item.name}.json`), JSON.stringify({
      $schema: 'https://ui.shadcn.com/schema/registry-item.json', ...item,
    }, null, 2) + '\n')
  }
  await writeFile(path.join(output, 'registry.json'), JSON.stringify(registry, null, 2) + '\n')
  return registry
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const registry = await buildRegistry(root, path.join(root, 'apps/registry/public/r'))
  console.log(`Built ${registry.items.length} registry items → apps/registry/public/r`)
}
