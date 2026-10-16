export interface CellEdit {
  readonly rowIndex: number
  readonly columnIndex: number
  readonly value: string
}

export interface CellPatch {
  readonly rowIndex: number
  readonly columnIndex: number
  readonly before: string
  readonly after: string
}

export type CellEditTransaction = readonly CellPatch[]

export interface CellHistory {
  readonly rows: string[][]
  readonly undo: readonly CellEditTransaction[]
  readonly redo: readonly CellEditTransaction[]
}

export const CELL_HISTORY_LIMIT = 100

/** Own the initial data so editing never changes the source matrix. */
export function createCellHistory(rows: readonly (readonly string[])[]): CellHistory {
  return { rows: rows.map((row) => [...row]), undo: [], redo: [] }
}

function isValidEdit(rows: readonly (readonly string[])[], edit: CellEdit): boolean {
  return Number.isInteger(edit.rowIndex)
    && Number.isInteger(edit.columnIndex)
    && edit.rowIndex >= 0
    && edit.rowIndex < rows.length
    && edit.columnIndex >= 0
    && edit.columnIndex < rows[edit.rowIndex]!.length
    && typeof edit.value === 'string'
}

/** Copy only the outer matrix and the rows touched by this transaction. */
function applyPatches(
  rows: string[][],
  patches: CellEditTransaction,
  direction: 'before' | 'after',
): string[][] {
  const nextRows = [...rows]
  const copiedRows = new Set<number>()

  for (const patch of patches) {
    if (!copiedRows.has(patch.rowIndex)) {
      nextRows[patch.rowIndex] = [...rows[patch.rowIndex]!]
      copiedRows.add(patch.rowIndex)
    }
    nextRows[patch.rowIndex]![patch.columnIndex] = patch[direction]
  }

  return nextRows
}

/** A batch is one undo step; repeated addresses use the batch's final value. */
export function applyCellEdits(history: CellHistory, edits: readonly CellEdit[]): CellHistory {
  const pending = new Map<string, CellPatch>()

  for (const edit of edits) {
    if (!isValidEdit(history.rows, edit)) continue
    const key = `${edit.rowIndex}:${edit.columnIndex}`
    pending.set(key, {
      rowIndex: edit.rowIndex,
      columnIndex: edit.columnIndex,
      before: history.rows[edit.rowIndex]![edit.columnIndex]!,
      after: edit.value,
    })
  }

  const transaction = [...pending.values()].filter((patch) => patch.before !== patch.after)
  if (transaction.length === 0) return history

  return {
    rows: applyPatches(history.rows, transaction, 'after'),
    undo: [...history.undo, transaction].slice(-CELL_HISTORY_LIMIT),
    redo: [],
  }
}

export function undoCellEdit(history: CellHistory): CellHistory {
  const transaction = history.undo.at(-1)
  if (!transaction) return history

  return {
    rows: applyPatches(history.rows, transaction, 'before'),
    undo: history.undo.slice(0, -1),
    redo: [...history.redo, transaction],
  }
}

export function redoCellEdit(history: CellHistory): CellHistory {
  const transaction = history.redo.at(-1)
  if (!transaction) return history

  return {
    rows: applyPatches(history.rows, transaction, 'after'),
    undo: [...history.undo, transaction].slice(-CELL_HISTORY_LIMIT),
    redo: history.redo.slice(0, -1),
  }
}
