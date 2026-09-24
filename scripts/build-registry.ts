import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrySchema, type Registry } from '@beast-ui/registry/schema'
import { safePath } from '@beast-ui/registry/node'

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
  // Read and validate the entire catalog before replacing any published output.
  for (const item of registry.items) {
    for (const file of item.files) {
      file.content = await readFile(await safePath(root, file.path), 'utf8')
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
  const registry = await buildRegistry(root, path.join(root, 'apps/docs/public/r'))
  console.log(`Built ${registry.items.length} registry items → apps/docs/public/r`)
}
