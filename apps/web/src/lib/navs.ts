import { componentTree, REGISTRY_URL, REPOSITORY_URL, type CatalogItem } from '@/lib/catalog'

export type NavItem = {
  href: string
  label: string
  value: string | number
  /** Drawn indented under the item before it, e.g. a component variant. */
  nested?: boolean
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

export const componentHref = (name: string): string => `/components/${name}`

const componentNav = (component: CatalogItem): Omit<NavItem, 'value'> => ({
  href: componentHref(component.name),
  label: component.title,
})

export const navGroups: NavGroup[] = [
  {
    title: 'Getting started',
    items: [{ href: '/', label: 'Introduction', value: '' }],
  },
  {
    title: 'Components',
    items: componentTree.flatMap(({ item, variants }, index) => [
      { ...componentNav(item), value: String(index + 1).padStart(2, '0') },
      ...variants.map((variant) => ({ ...componentNav(variant), value: '', nested: true })),
    ]),
  },
  {
    title: 'Resources',
    items: [
      { href: `${REGISTRY_URL}/registry.json`, label: 'Registry JSON', value: '↗' },
      { href: REPOSITORY_URL, label: 'GitHub', value: '↗' },
      { href: 'https://beast-docs-adv.beastjs.workers.dev', label: 'beast-tsrx', value: '↗' },
    ],
  },
]
