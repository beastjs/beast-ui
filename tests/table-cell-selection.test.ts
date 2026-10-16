import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { cellAddressKey, extendCellSelection, getSelectedCells, getVisibleSelectedCells, moveCell, selectCellSelection, toggleCellSelection, type CellRange } from '../packages/cli/templates/table/ui/table/hyper/cell-selection.ts'

const rowIds = ['row-a', 'row-b', 'row-c']
const columnIds = ['column-a', 'column-b', 'column-c']

describe('cell selection', () => {
  test('Command-click adds isolated cells without filling the cells between them', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const initial = toggleCellSelection(null, first)!
    const added = toggleCellSelection(initial, other)!
    assert.deepEqual(added.cells, [first, other])
    assert.deepEqual(added.anchor, other)
    assert.deepEqual(added.focus, other)
    assert.deepEqual(initial.cells, [first])
  })

  test('Command-click preserves a rectangle while adding and removing individual cells', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const last = { rowId: 'row-b', columnId: 'column-b' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const rectangle = extendCellSelection(selectCellSelection(first), last, rowIds, columnIds)
    const added = toggleCellSelection(rectangle, other)!
    assert.deepEqual(added.cells, [...rectangle.cells, other])
    const removed = toggleCellSelection(added, first)!
    assert.deepEqual(removed.cells, [...rectangle.cells.slice(1), other])
    assert.deepEqual(rectangle.cells.length, 4)
  })

  test('removing the active cell restores focus to a selected cell; removing the last clears selection', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const added = toggleCellSelection(selectCellSelection(first), other)!
    const removed = toggleCellSelection(added, { ...other })!
    assert.deepEqual(removed, selectCellSelection(first))
    assert.equal(toggleCellSelection(removed, first), null)
  })

  test('toggling uses complete addresses without confusing delimiter-containing ids', () => {
    const first = { rowId: 'a:b', columnId: 'c' }
    const other = { rowId: 'a', columnId: 'b:c' }
    const added = toggleCellSelection(selectCellSelection(first), other)!
    assert.equal(added.cells.length, 2)
    assert.deepEqual(toggleCellSelection(added, first)!.cells, [other])
  })

  test('a plain click replaces the previous rectangle, including clicking a selected cell', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const single = selectCellSelection(first)
    const multiple = extendCellSelection(single, other, rowIds, columnIds)
    assert.equal(multiple.cells.length, 9)
    assert.deepEqual(selectCellSelection(first).cells, [first])
    assert.deepEqual(selectCellSelection(other).cells, [other])
    assert.deepEqual(single.cells, [first])
  })

  test('editing and unmodified keyboard navigation select only the destination cell', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const initial = extendCellSelection(selectCellSelection(first), other, rowIds, columnIds)
    const focused = selectCellSelection(other)
    assert.deepEqual(focused.cells, [other])
    assert.deepEqual(focused.focus, other)
    assert.equal(initial.cells.length, 9)
  })

  test('drag and Shift ranges shrink back to the anchor without retaining old cells', () => {
    const anchor = { rowId: 'row-a', columnId: 'column-a' }
    const initial = selectCellSelection(anchor)
    const extended = extendCellSelection(initial, { rowId: 'row-b', columnId: 'column-b' }, rowIds, columnIds)
    assert.equal(extended.cells.length, 4)
    const shrunk = extendCellSelection(extended, anchor, rowIds, columnIds)
    assert.deepEqual(shrunk.cells, [anchor])
    assert.deepEqual(initial.cells, [anchor])
  })

  test('selection exposes only cells in visible rows and columns', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const other = { rowId: 'row-c', columnId: 'column-c' }
    const selection = extendCellSelection(selectCellSelection(first), other, rowIds, columnIds)
    assert.deepEqual(getVisibleSelectedCells(selection, ['row-a'], ['column-a']), [first])
    assert.deepEqual(getVisibleSelectedCells(selection, ['row-c'], ['column-c']), [other])
    assert.deepEqual(getVisibleSelectedCells(null, rowIds, columnIds), [])
  })
  test('a reversed range includes the complete rectangle in displayed order', () => {
    const selection = {
      anchor: { rowId: 'row-c', columnId: 'column-c' },
      focus: { rowId: 'row-a', columnId: 'column-b' },
    }
    assert.deepEqual(getSelectedCells(selection, rowIds, columnIds), [
      { rowId: 'row-a', columnId: 'column-b' },
      { rowId: 'row-a', columnId: 'column-c' },
      { rowId: 'row-b', columnId: 'column-b' },
      { rowId: 'row-b', columnId: 'column-c' },
      { rowId: 'row-c', columnId: 'column-b' },
      { rowId: 'row-c', columnId: 'column-c' },
    ])
  })

  test('ranges follow sorted rows and reordered columns including pinned edges', () => {
    const displayedRows = ['row-c', 'row-a', 'row-b']
    const displayedColumns = ['pinned-left', 'column-c', 'column-a', 'pinned-right']
    const selection = {
      anchor: { rowId: 'row-c', columnId: 'column-a' },
      focus: { rowId: 'row-a', columnId: 'pinned-left' },
    }
    assert.deepEqual(getSelectedCells(selection, displayedRows, displayedColumns), [
      { rowId: 'row-c', columnId: 'pinned-left' },
      { rowId: 'row-c', columnId: 'column-c' },
      { rowId: 'row-c', columnId: 'column-a' },
      { rowId: 'row-a', columnId: 'pinned-left' },
      { rowId: 'row-a', columnId: 'column-c' },
      { rowId: 'row-a', columnId: 'column-a' },
    ])
    assert.deepEqual(moveCell(
      { rowId: 'row-c', columnId: 'column-a' }, displayedRows, displayedColumns, 'right',
    ), { rowId: 'row-c', columnId: 'pinned-right' })
    assert.deepEqual(moveCell(
      { rowId: 'row-c', columnId: 'column-a' }, displayedRows, displayedColumns, 'down',
    ), { rowId: 'row-a', columnId: 'column-a' })
  })

  test('missing or filtered endpoints produce no partial range', () => {
    const valid = { rowId: 'row-a', columnId: 'column-a' }
    const missing = [
      { rowId: 'filtered-row', columnId: 'column-a' },
      { rowId: 'row-a', columnId: 'hidden-column' },
    ]
    for (const address of missing) {
      assert.deepEqual(getSelectedCells({ anchor: address, focus: valid }, rowIds, columnIds), [])
      assert.deepEqual(getSelectedCells({ anchor: valid, focus: address }, rowIds, columnIds), [])
    }
    const selection: CellRange = { anchor: valid, focus: valid }
    assert.deepEqual(getSelectedCells(selection, [], columnIds), [])
    assert.deepEqual(getSelectedCells(selection, rowIds, []), [])
    assert.deepEqual(getSelectedCells(null, rowIds, columnIds), [])
  })

  test('cell keys distinguish addresses containing separators and escaped characters', () => {
    const addresses = [
      { rowId: 'a:b', columnId: 'c' },
      { rowId: 'a', columnId: 'b:c' },
      { rowId: 'a|b', columnId: 'c' },
      { rowId: 'a', columnId: 'b|c' },
      { rowId: 'a", "b', columnId: 'c' },
      { rowId: 'a', columnId: 'b", "c' },
      { rowId: '', columnId: 'a' },
      { rowId: 'a', columnId: '' },
    ]
    const keys = addresses.map(cellAddressKey)
    assert.equal(new Set(keys).size, addresses.length)
    assert.equal(cellAddressKey({ ...addresses[0] }), keys[0])
  })

  test('arrow movement clamps at all four table edges', () => {
    const first = { rowId: 'row-a', columnId: 'column-a' }
    const last = { rowId: 'row-c', columnId: 'column-c' }
    assert.deepEqual(moveCell(first, rowIds, columnIds, 'up'), first)
    assert.deepEqual(moveCell(first, rowIds, columnIds, 'left'), first)
    assert.deepEqual(moveCell(last, rowIds, columnIds, 'down'), last)
    assert.deepEqual(moveCell(last, rowIds, columnIds, 'right'), last)

    const middle = { rowId: 'row-b', columnId: 'column-b' }
    assert.deepEqual(moveCell(middle, rowIds, columnIds, 'up'), { rowId: 'row-a', columnId: 'column-b' })
    assert.deepEqual(moveCell(middle, rowIds, columnIds, 'down'), { rowId: 'row-c', columnId: 'column-b' })
    assert.deepEqual(moveCell(middle, rowIds, columnIds, 'left'), { rowId: 'row-b', columnId: 'column-a' })
    assert.deepEqual(moveCell(middle, rowIds, columnIds, 'right'), { rowId: 'row-b', columnId: 'column-c' })
  })

  test('movement rejects cells missing from the current page or visible columns', () => {
    assert.equal(moveCell({ rowId: 'other-page', columnId: 'column-a' }, rowIds, columnIds, 'down'), null)
    assert.equal(moveCell({ rowId: 'row-a', columnId: 'hidden-column' }, rowIds, columnIds, 'right'), null)
    const first = { rowId: 'row-a', columnId: 'column-a' }
    assert.equal(moveCell(first, [], columnIds, 'right'), null)
    assert.equal(moveCell(first, rowIds, [], 'right'), null)
  })

  test('Tab wraps forward to the next displayed row and stops at the final cell', () => {
    assert.deepEqual(moveCell(
      { rowId: 'row-a', columnId: 'column-c' }, rowIds, columnIds, 'right', true,
    ), { rowId: 'row-b', columnId: 'column-a' })
    assert.deepEqual(moveCell(
      { rowId: 'row-b', columnId: 'column-b' }, rowIds, columnIds, 'right', true,
    ), { rowId: 'row-b', columnId: 'column-c' })
    const last = { rowId: 'row-c', columnId: 'column-c' }
    assert.deepEqual(moveCell(last, rowIds, columnIds, 'right', true), last)
  })

  test('Shift+Tab wraps backward to the previous displayed row and stops at the first cell', () => {
    assert.deepEqual(moveCell(
      { rowId: 'row-c', columnId: 'column-a' }, rowIds, columnIds, 'left', true,
    ), { rowId: 'row-b', columnId: 'column-c' })
    assert.deepEqual(moveCell(
      { rowId: 'row-b', columnId: 'column-b' }, rowIds, columnIds, 'left', true,
    ), { rowId: 'row-b', columnId: 'column-a' })
    const first = { rowId: 'row-a', columnId: 'column-a' }
    assert.deepEqual(moveCell(first, rowIds, columnIds, 'left', true), first)
  })
})
