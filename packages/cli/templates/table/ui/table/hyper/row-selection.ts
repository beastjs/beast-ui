/** Structural selection state keeps this range helper independent of the table runtime. */
export type RowSelectionState = Record<string, true>

export interface RowSelectionDrag {
  readonly anchor: string
  readonly focus: string
  readonly checked: boolean
}

/** Rebuild each drag range from its starting selection, so reversing can shrink it. */
export function applyRowSelectionDrag(
  initial: RowSelectionState,
  drag: RowSelectionDrag,
  rowIds: readonly string[],
  selectableRowIds: ReadonlySet<string>,
): RowSelectionState {
  const anchor = rowIds.indexOf(drag.anchor)
  const focus = rowIds.indexOf(drag.focus)
  if (anchor < 0 || focus < 0) return initial
  const range = rowIds.slice(Math.min(anchor, focus), Math.max(anchor, focus) + 1)
    .filter((id) => selectableRowIds.has(id))
  if (range.every((id) => (Object.hasOwn(initial, id) && initial[id]) === drag.checked)) return initial
  const rangeIds = new Set(range)
  const entries = Object.entries(initial).filter(([id]) => !rangeIds.has(id))
  if (drag.checked) entries.push(...range.map((id): [string, true] => [id, true]))
  return Object.fromEntries(entries)
}
