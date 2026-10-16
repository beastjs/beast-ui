import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  CELL_HISTORY_LIMIT,
  applyCellEdits,
  createCellHistory,
  redoCellEdit,
  undoCellEdit,
} from '../packages/cli/templates/table/ui/table/hyper/cell-history.ts'

describe('cell edit history', () => {
  test('owns its source data and edits only copy affected rows', () => {
    const source = [['A', 'B'], ['C', 'D']]
    const history = createCellHistory(source)
    source[0]![0] = 'source changed'

    const next = applyCellEdits(history, [{ rowIndex: 0, columnIndex: 1, value: 'edited' }])

    assert.deepEqual(history.rows, [['A', 'B'], ['C', 'D']])
    assert.deepEqual(next.rows, [['A', 'edited'], ['C', 'D']])
    assert.notEqual(next.rows, history.rows)
    assert.notEqual(next.rows[0], history.rows[0])
    assert.equal(next.rows[1], history.rows[1])
    assert.deepEqual(source, [['source changed', 'B'], ['C', 'D']])
  })

  test('empty and no-op batches preserve history, including redo', () => {
    const initial = createCellHistory([['A']])
    const undone = undoCellEdit(applyCellEdits(initial, [{ rowIndex: 0, columnIndex: 0, value: 'B' }]))

    assert.equal(applyCellEdits(undone, []), undone)
    assert.equal(applyCellEdits(undone, [{ rowIndex: 0, columnIndex: 0, value: 'A' }]), undone)
    assert.equal(applyCellEdits(undone, [
      { rowIndex: 0, columnIndex: 0, value: 'temporary' },
      { rowIndex: 0, columnIndex: 0, value: 'A' },
    ]), undone)
    assert.equal(undone.redo.length, 1)
  })

  test('a multi-cell batch is undone and redone atomically', () => {
    const initial = createCellHistory([['A', 'B'], ['C', 'D']])
    const edited = applyCellEdits(initial, [
      { rowIndex: 0, columnIndex: 0, value: 'first' },
      { rowIndex: 1, columnIndex: 1, value: 'second' },
      { rowIndex: 0, columnIndex: 0, value: 'final' },
    ])

    assert.equal(edited.undo.length, 1)
    assert.equal(edited.undo[0].length, 2)
    assert.deepEqual(edited.rows, [['final', 'B'], ['C', 'second']])

    const undone = undoCellEdit(edited)
    assert.deepEqual(undone.rows, initial.rows)
    assert.equal(undone.undo.length, 0)
    assert.equal(undone.redo.length, 1)

    const redone = redoCellEdit(undone)
    assert.deepEqual(redone.rows, edited.rows)
    assert.equal(redone.undo.length, 1)
    assert.equal(redone.redo.length, 0)
  })

  test('multiple undo steps restore values in order and a new edit clears redo', () => {
    const initial = createCellHistory([['A', 'B']])
    const first = applyCellEdits(initial, [{ rowIndex: 0, columnIndex: 0, value: 'one' }])
    const second = applyCellEdits(first, [{ rowIndex: 0, columnIndex: 0, value: 'two' }])
    const undone = undoCellEdit(second)

    assert.deepEqual(undone.rows, [['one', 'B']])
    assert.deepEqual(undoCellEdit(undone).rows, initial.rows)
    assert.deepEqual(redoCellEdit(redoCellEdit(undoCellEdit(undone))).rows, second.rows)

    const branched = applyCellEdits(undone, [{ rowIndex: 0, columnIndex: 1, value: 'branch' }])
    assert.deepEqual(branched.rows, [['one', 'branch']])
    assert.equal(branched.redo.length, 0)
    assert.equal(redoCellEdit(branched), branched)
    assert.deepEqual(undoCellEdit(branched).rows, undone.rows)
  })

  test('invalid addresses are ignored without changing valid edits in the same batch', () => {
    const initial = createCellHistory([['A', 'B'], ['C']])
    const invalid = [
      { rowIndex: -1, columnIndex: 0, value: 'bad' },
      { rowIndex: 2, columnIndex: 0, value: 'bad' },
      { rowIndex: 0, columnIndex: -1, value: 'bad' },
      { rowIndex: 0, columnIndex: 2, value: 'bad' },
      { rowIndex: 1, columnIndex: 1, value: 'bad' },
      { rowIndex: 0.5, columnIndex: 0, value: 'bad' },
      { rowIndex: 0, columnIndex: 0.5, value: 'bad' },
      { rowIndex: NaN, columnIndex: 0, value: 'bad' },
      { rowIndex: 0, columnIndex: Infinity, value: 'bad' },
    ]

    assert.equal(applyCellEdits(initial, invalid), initial)
    assert.deepEqual(applyCellEdits(createCellHistory([]), invalid).rows, [])
    const next = applyCellEdits(initial, [...invalid, { rowIndex: 1, columnIndex: 0, value: 'valid' }])
    assert.deepEqual(next.rows, [['A', 'B'], ['valid']])
    assert.equal(next.undo[0].length, 1)
    assert.deepEqual(initial.rows, [['A', 'B'], ['C']])
  })

  test('retains only the most recent bounded undo transactions', () => {
    let history = createCellHistory([['0']])
    for (let index = 1; index <= CELL_HISTORY_LIMIT + 1; index++) {
      history = applyCellEdits(history, [{ rowIndex: 0, columnIndex: 0, value: String(index) }])
    }
    assert.equal(history.undo.length, CELL_HISTORY_LIMIT)

    for (let index = 0; index < CELL_HISTORY_LIMIT; index++) history = undoCellEdit(history)
    assert.deepEqual(history.rows, [['1']])
    assert.equal(history.redo.length, CELL_HISTORY_LIMIT)
    assert.equal(undoCellEdit(history), history)

    for (let index = 0; index < CELL_HISTORY_LIMIT; index++) history = redoCellEdit(history)
    assert.deepEqual(history.rows, [[String(CELL_HISTORY_LIMIT + 1)]])
    assert.equal(history.undo.length, CELL_HISTORY_LIMIT)
    assert.equal(redoCellEdit(history), history)
  })

  test('does not mutate frozen previous matrices or history stacks', () => {
    const initial = createCellHistory([['A', 'B'], ['C', 'D']])
    for (const row of initial.rows) Object.freeze(row)
    Object.freeze(initial.rows)
    Object.freeze(initial.undo)
    Object.freeze(initial.redo)
    Object.freeze(initial)

    const edited = applyCellEdits(initial, [{ rowIndex: 0, columnIndex: 0, value: 'changed' }])
    Object.freeze(edited.undo[0])
    Object.freeze(edited.undo)
    Object.freeze(edited.redo)
    for (const row of edited.rows) Object.freeze(row)
    Object.freeze(edited.rows)
    Object.freeze(edited)

    const undone = undoCellEdit(edited)
    const redone = redoCellEdit(undone)
    assert.deepEqual(initial.rows, [['A', 'B'], ['C', 'D']])
    assert.deepEqual(edited.rows, [['changed', 'B'], ['C', 'D']])
    assert.deepEqual(undone.rows, initial.rows)
    assert.deepEqual(redone.rows, edited.rows)
  })
})
