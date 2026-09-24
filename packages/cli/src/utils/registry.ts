import { itemNameSchema, registryItemSchema, registrySchema, registryUrlSchema, type RegistryItem } from '@beast-ui/registry/schema'

export async function fetchJson(registry: string, filename: string): Promise<unknown> {
  registryUrlSchema.parse(registry)
  const url = `${registry.replace(/\/$/, '')}/${filename}`
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Registry request failed (${response.status}): ${url}`)
  try { return await response.json() }
  catch { throw new Error(`Registry did not return JSON: ${url}`) }
}

export async function fetchComponent(registry: string, name: string): Promise<RegistryItem> {
  itemNameSchema.parse(name)
  const item = registryItemSchema.parse(await fetchJson(registry, `${name}.json`))
  if (item.name !== name) throw new Error(`Expected registry item ${name}, received ${item.name}`)
  if (item.files.some((file) => file.content === undefined)) throw new Error(`Missing file content in registry item: ${name}`)
  return item
}

export async function fetchCatalog(registry: string) {
  return registrySchema.parse(await fetchJson(registry, 'registry.json'))
}

export async function resolveItems(registry: string, names: string[]): Promise<RegistryItem[]> {
  const resolved = new Map<string, RegistryItem>()
  const visiting = new Set<string>()
  async function visit(name: string) {
    if (visiting.has(name)) throw new Error(`Circular registry dependency: ${name}`)
    if (resolved.has(name)) return
    visiting.add(name)
    const item = await fetchComponent(registry, name)
    for (const dependency of item.registryDependencies) await visit(dependency)
    visiting.delete(name)
    resolved.set(name, item)
  }
  for (const name of names) await visit(name)
  return [...resolved.values()]
}
