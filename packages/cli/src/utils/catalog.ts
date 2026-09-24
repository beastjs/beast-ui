import type { RegistryItem } from '@beast-ui/registry/schema'

type ListedItem = Pick<RegistryItem, 'name' | 'type' | 'description' | 'meta'>

export interface CatalogRow {
  name: string
  description: string
  /** A variant, listed under its base component. */
  nested: boolean
}

/** Catalog order, with each variant placed under its base component. */
export function catalogRows(items: ListedItem[]): CatalogRow[] {
  const names = new Set(items.map((item) => item.name))
  const baseOf = (item: ListedItem): string | undefined => {
    const base = item.meta?.variantOf
    return base !== undefined && names.has(base) ? base : undefined
  }
  const row = (item: ListedItem, nested: boolean): CatalogRow => ({ name: item.name, description: item.description ?? item.type, nested })
  return items
    .filter((item) => baseOf(item) === undefined)
    .flatMap((item) => [row(item, false), ...items.filter((variant) => baseOf(variant) === item.name).map((variant) => row(variant, true))])
}

/** Plain-text catalog lines: each variant is indented under its base component. */
export function formatCatalog(items: ListedItem[]): string[] {
  const rows = catalogRows(items)
  const label = (row: CatalogRow) => `${row.nested ? '  ' : ''}${row.name}`
  const width = Math.max(...rows.map((row) => label(row).length)) + 2
  return rows.map((row) => `${label(row).padEnd(width)}${row.description}`)
}
