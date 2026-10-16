import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { applyRowSelectionDrag, type RowSelectionState } from '../packages/cli/templates/table/ui/table/hyper/row-selection.ts'

describe('row selection dragging', () => {
  const ids = ['a', 'b', 'c', 'd']
  const selectable = new Set(ids)

  test('selects every row between the anchor and focus while preserving other selections', () => {
    const initial: RowSelectionState = { elsewhere: true }
    assert.deepEqual(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'c', checked: true }, ids, selectable),
      { elsewhere: true, a: true, b: true, c: true })
    assert.deepEqual(initial, { elsewhere: true })
  })

  test('a checked anchor clears a range without clearing rows outside it', () => {
    assert.deepEqual(applyRowSelectionDrag({ a: true, b: true, c: true, d: true },
      { anchor: 'c', focus: 'a', checked: false }, ids, selectable), { d: true })
  })

  test('reversed and shrinking drags use the displayed order and original selection', () => {
    const initial: RowSelectionState = { d: true }
    const order = ['c', 'a', 'd', 'b']
    assert.deepEqual(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'b', checked: true }, order, selectable),
      { a: true, d: true, b: true })
    assert.deepEqual(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'c', checked: true }, order, selectable),
      { c: true, a: true, d: true })
    assert.deepEqual(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'a', checked: true }, order, selectable),
      { a: true, d: true })
  })

  test('only selectable rows in the current page or filtered view participate', () => {
    const initial: RowSelectionState = { hidden: true }
    assert.deepEqual(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'c', checked: true },
      ['a', 'group', 'b', 'c'], new Set(['a', 'c'])), { hidden: true, a: true, c: true })
    assert.equal(applyRowSelectionDrag(initial, { anchor: 'missing', focus: 'c', checked: true }, ids, selectable), initial)
    assert.equal(applyRowSelectionDrag(initial, { anchor: 'a', focus: 'missing', checked: true }, ids, selectable), initial)
  })

  test('single-row clicks toggle once and unchanged ranges preserve their state object', () => {
    assert.deepEqual(applyRowSelectionDrag({}, { anchor: 'b', focus: 'b', checked: true }, ids, selectable), { b: true })
    assert.deepEqual(applyRowSelectionDrag({ b: true }, { anchor: 'b', focus: 'b', checked: false }, ids, selectable), {})
    const initial: RowSelectionState = { b: true }
    assert.equal(applyRowSelectionDrag(initial, { anchor: 'b', focus: 'b', checked: true }, ids, selectable), initial)
  })

  test('arbitrary row ids remain own keys rather than prototype properties', () => {
    const special = ['__proto__', 'constructor', 'a:b']
    const selection = applyRowSelectionDrag({}, { anchor: special[0], focus: special[2], checked: true }, special, new Set(special))
    assert.deepEqual(Object.keys(selection), special)
    assert.equal(Object.getPrototypeOf(selection), Object.prototype)
    assert.deepEqual(Object.values(selection), [true, true, true])
  })
})
