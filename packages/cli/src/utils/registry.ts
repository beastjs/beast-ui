import { itemNameSchema, registryUrlSchema, remoteRegistryItemSchema, remoteRegistrySchema, type RegistryItem } from '@beast-ui/registry/schema'

export class RegistryRequestError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`Registry request failed (${status}): ${url}`)
  }
}

export async function fetchJson(registry: string, filename: string): Promise<unknown> {
  registryUrlSchema.parse(registry)
  const url = `${registry.replace(/\/$/, '')}/${filename}`
  let response: Response
  try { response = await fetch(url, { signal: AbortSignal.timeout(15_000) }) }
  catch (error) { throw new Error(`Could not reach the registry at ${url}: ${error instanceof Error ? error.message : String(error)}`) }
  if (!response.ok) throw new RegistryRequestError(response.status, url)
  try { return await response.json() }
  catch { throw new Error(`Registry did not return JSON: ${url}`) }
}

export async function fetchComponent(registry: string, name: string): Promise<RegistryItem> {
  itemNameSchema.parse(name)
  let payload: unknown
  try { payload = await fetchJson(registry, `${name}.json`) }
  catch (error) {
    if (error instanceof RegistryRequestError && error.status === 404) {
      throw new Error(`Unknown registry item: ${name}. Run list to see available items. (${error.url})`)
    }
    throw error
  }
  const item = remoteRegistryItemSchema.parse(payload)
  if (item.name !== name) throw new Error(`Expected registry item ${name}, received ${item.name}`)
  if (item.files.some((file) => file.content === undefined)) throw new Error(`Missing file content in registry item: ${name}`)
  return item
}

export async function fetchCatalog(registry: string) {
  return remoteRegistrySchema.parse(await fetchJson(registry, 'registry.json'))
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
