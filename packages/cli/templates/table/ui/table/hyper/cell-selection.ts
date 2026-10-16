export interface CellAddress {
  readonly rowId: string
  readonly columnId: string
}

export interface CellRange {
  readonly anchor: CellAddress
  readonly focus: CellAddress
}

export interface CellSelection extends CellRange {
  readonly cells: readonly CellAddress[]
}

export interface CellValueEdit extends CellAddress {
  readonly value: string
}

/** The consumer owns values and history; the table owns the visible selection. */
export interface CellEditingOptions {
  onEdit: (edits: readonly CellValueEdit[]) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Replacing the source clears cell selection and any unfinished editor. */
  resetKey?: unknown
}

export type CellMove = 'up' | 'down' | 'left' | 'right'

export const cellAddressKey = (address: CellAddress): string => JSON.stringify([address.rowId, address.columnId])

/** Ranges use the displayed order, including sorting, column ordering and pinning. */
export function getSelectedCells(
  selection: CellRange | null,
  rowIds: readonly string[],
  columnIds: readonly string[],
): CellAddress[] {
  if (!selection) return []
  const anchorRow = rowIds.indexOf(selection.anchor.rowId)
  const focusRow = rowIds.indexOf(selection.focus.rowId)
  const anchorColumn = columnIds.indexOf(selection.anchor.columnId)
  const focusColumn = columnIds.indexOf(selection.focus.columnId)
  if ([anchorRow, focusRow, anchorColumn, focusColumn].some((index) => index < 0)) return []

  const cells: CellAddress[] = []
  for (let row = Math.min(anchorRow, focusRow); row <= Math.max(anchorRow, focusRow); row += 1) {
    for (let column = Math.min(anchorColumn, focusColumn); column <= Math.max(anchorColumn, focusColumn); column += 1) {
      cells.push({ rowId: rowIds[row]!, columnId: columnIds[column]! })
    }
  }
  return cells
}

export function getVisibleSelectedCells(
  selection: CellSelection | null,
  rowIds: readonly string[],
  columnIds: readonly string[],
): CellAddress[] {
  const rows = new Set(rowIds)
  const columns = new Set(columnIds)
  return selection?.cells.filter((cell) => rows.has(cell.rowId) && columns.has(cell.columnId)) ?? []
}

/** A click or unmodified keyboard move replaces the selection with one cell. */
export function selectCellSelection(address: CellAddress): CellSelection {
  return { anchor: address, focus: address, cells: [address] }
}

/** Command/Control-click toggles one cell without replacing other selections. */
export function toggleCellSelection(selection: CellSelection | null, address: CellAddress): CellSelection | null {
  if (!selection) return selectCellSelection(address)
  const key = cellAddressKey(address)
  const cells = selection.cells.filter((cell) => cellAddressKey(cell) !== key)
  if (cells.length === selection.cells.length) {
    return { anchor: address, focus: address, cells: [...selection.cells, address] }
  }
  if (cells.length === 0) return null
  const focus = cellAddressKey(selection.focus) === key ? cells[cells.length - 1]! : selection.focus
  const anchor = cellAddressKey(selection.anchor) === key ? focus : selection.anchor
  return { anchor, focus, cells }
}

export function extendCellSelection(
  selection: CellSelection | null,
  address: CellAddress,
  rowIds: readonly string[],
  columnIds: readonly string[],
): CellSelection {
  if (!selection) return selectCellSelection(address)
  const range = { anchor: selection.anchor, focus: address }
  return { ...range, cells: getSelectedCells(range, rowIds, columnIds) }
}

/** Arrows stop at an edge; Tab wraps across rows without leaving this page. */
export function moveCell(
  address: CellAddress,
  rowIds: readonly string[],
  columnIds: readonly string[],
  direction: CellMove,
  wrap = false,
): CellAddress | null {
  let row = rowIds.indexOf(address.rowId)
  let column = columnIds.indexOf(address.columnId)
  if (row < 0 || column < 0 || rowIds.length === 0 || columnIds.length === 0) return null
  if (direction === 'up') row -= 1
  if (direction === 'down') row += 1
  if (direction === 'left') column -= 1
  if (direction === 'right') column += 1
  if (wrap && column < 0 && row > 0) {
    row -= 1
    column = columnIds.length - 1
  } else if (wrap && column >= columnIds.length && row < rowIds.length - 1) {
    row += 1
    column = 0
  }
  row = Math.max(0, Math.min(rowIds.length - 1, row))
  column = Math.max(0, Math.min(columnIds.length - 1, column))
  return { rowId: rowIds[row]!, columnId: columnIds[column]! }
}
