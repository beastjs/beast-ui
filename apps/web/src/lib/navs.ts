import type { IconName } from '@/lib/icons/types'
import { components, REGISTRY_URL, REPOSITORY_URL } from '@/lib/catalog'
import { previews } from '@/previews'

export type NavItem = {
  href: string
  icon: IconName
  label: string
  value: string | number
}

export type NavGroup = {
  title: string
  items: NavItem[]
}

export const componentHref = (name: string): string => `/components/${name}`

export const navGroups: NavGroup[] = [
  {
    title: 'Getting started',
    items: [{ href: '/', icon: 'beast', label: 'Introduction', value: '' }],
  },
  {
    title: 'Components',
    items: components.map((component, index) => ({
      href: componentHref(component.name),
      icon: previews[component.name]?.icon ?? 'folder',
      label: component.title,
      value: String(index + 1).padStart(2, '0'),
    })),
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
