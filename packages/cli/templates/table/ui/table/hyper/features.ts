import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createExpandedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_includesString,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowExpandingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures
} from '@octanejs/tanstack-table'
import type { DataTableColumnMeta } from './cell-editor.ts'

export const features = tableFeatures({
  columnMeta: metaHelper<MyColumnMeta>(),
  columnFilteringFeature,
  globalFilteringFeature,
  // Faceting powers the filter list's option counts (`getFacetedUniqueValues`).
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    arrHas: filterFn_arrHas,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
  columnGroupingFeature,
  groupedRowModel: createGroupedRowModel(),
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  columnResizingFeature
})

export interface MyColumnMeta extends DataTableColumnMeta {
  label?: string
  variant?: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi-select'
  options?: Array<{ label: string; value: string; count?: number }>
  filterOptions?: Array<string | number | boolean>
  filterOptionLimit?: number
}
