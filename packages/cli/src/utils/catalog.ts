import type { RegistryItem } from '@beast-ui/registry/schema'

type ListedItem = Pick<RegistryItem, 'name' | 'type' | 'description' | 'meta'>

/** Catalog lines for `list`: each variant is indented under its base component. */
export function formatCatalog(items: ListedItem[]): string[] {
  const names = new Set(items.map((item) => item.name))
  const baseOf = (item: ListedItem): string | undefined => {
    const base = item.meta?.variantOf
    return base !== undefined && names.has(base) ? base : undefined
  }
  const rows: { name: string; description: string }[] = []
  for (const item of items) {
    if (baseOf(item) !== undefined) continue
    rows.push({ name: item.name, description: item.description ?? item.type })
    for (const variant of items) {
      if (baseOf(variant) === item.name) rows.push({ name: `  ${variant.name}`, description: variant.description ?? variant.type })
    }
  }
  const width = Math.max(...rows.map((row) => row.name.length)) + 2
  return rows.map((row) => `${row.name.padEnd(width)}${row.description}`)
}
