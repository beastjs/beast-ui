import type { IconName } from '@beast-ui/icons'
import { componentTree, REGISTRY_URL, REPOSITORY_URL, type CatalogItem } from '@/lib/catalog'
import { previews } from '@/previews'

export type NavItem = {
  href: string
  icon: IconName
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
  icon: previews[component.name]?.icon ?? 'folder',
  label: component.title,
})

export const navGroups: NavGroup[] = [
  {
    title: 'Getting started',
    items: [{ href: '/', icon: 'beast', label: 'Introduction', value: '' }],
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
      { href: `${REGISTRY_URL}/registry.json`, icon: 'folder', label: 'Registry JSON', value: '↗' },
      { href: REPOSITORY_URL, icon: 'account', label: 'GitHub', value: '↗' },
      { href: 'https://beast-docs-adv.beastjs.workers.dev', icon: 'mechanics', label: 'beast-tsrx', value: '↗' },
    ],
  },
]
