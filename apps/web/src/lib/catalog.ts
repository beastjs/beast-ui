import registry from '../../../../registry.json'

export const REGISTRY_URL = 'https://beast-ui-registry.beastjs.workers.dev/r'
export const REPOSITORY_URL = 'https://github.com/beastjs/beast-ui'
export const CLI = 'npx @beastjs/cli'

export interface CatalogItem {
  name: string
  title: string
  description: string
  dependencies: string[]
  registryDependencies: string[]
}

interface RegistryEntry {
  name: string
  type: string
  title?: string
  description?: string
  dependencies?: string[]
  registryDependencies?: string[]
}

const entries: RegistryEntry[] = registry.items

/** UI components in catalog order; each gets a page at /components/<name>. */
export const components: CatalogItem[] = entries
  .filter((entry) => entry.type === 'registry:ui')
  .map((entry) => ({
    name: entry.name,
    title: entry.title ?? entry.name,
    description: entry.description ?? '',
    dependencies: entry.dependencies ?? [],
    registryDependencies: entry.registryDependencies ?? [],
  }))

export function findComponent(name: string | undefined): CatalogItem | undefined {
  return components.find((component) => component.name === name)
}

export const itemUrl = (name: string): string => `${REGISTRY_URL}/${name}.json`
export const addCommand = (name: string): string => `${CLI} add ${name}`
