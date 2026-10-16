import type { GroupingState } from '@octanejs/tanstack-table'

export const MAX_GROUPING_COLUMNS = 8

/** Reject stale/display-only columns and keep the reader's nesting order. */
export function normalizeGrouping(ids: readonly string[], allowedIds: readonly string[]): GroupingState {
  const allowed = new Set(allowedIds)
  return [...new Set(ids)].filter((id) => allowed.has(id)).slice(0, MAX_GROUPING_COLUMNS)
}

export function moveGroupingColumn(grouping: GroupingState, id: string, direction: -1 | 1): GroupingState {
  const index = grouping.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= grouping.length) return grouping
  const next = [...grouping]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function getGroupValueLabel(value: unknown): string {
  return value === null || value === undefined || value === '' ? '(Empty)' : String(value)
}
