import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getInitialEditorValue, isAllowedCellValue, type CellEditorType } from '../packages/cli/templates/table/ui/table/hyper/cell-editor.ts'

describe('column-declared editor behavior', () => {
  test('columns without editor metadata accept arbitrary text', () => {
    for (const value of ['Active', '001', 'new choice', '', '2026-02-29']) {
      assert.equal(isAllowedCellValue(undefined, value), true)
    }
    assert.equal(getInitialEditorValue(undefined, 'old', 'x'), 'x')
  })

  test('select options and keyboard entry come from the column', () => {
    const editor: CellEditorType = { type: 'select', options: ['Draft', 'Published', 'Archived'] }
    assert.equal(getInitialEditorValue(editor, 'Draft', 'p'), 'Published')
    assert.equal(getInitialEditorValue(editor, 'Draft', 'x'), 'Draft')
    assert.equal(isAllowedCellValue(editor, 'Published'), true)
    assert.equal(isAllowedCellValue(editor, 'unknown'), false)
    assert.equal(isAllowedCellValue(editor, ''), true)
  })

  test('read-only and required columns reject editing or clearing', () => {
    assert.equal(isAllowedCellValue(false, 'anything'), false)
    assert.equal(isAllowedCellValue(false, ''), false)
    assert.equal(isAllowedCellValue({ type: 'text', required: true }, ''), false)
    assert.equal(isAllowedCellValue({ type: 'text', required: true }, 'value'), true)
  })

  test('columns can override validation and keyboard initialization', () => {
    const editor: CellEditorType = {
      type: 'text', validate: (value) => /^#[0-9a-f]{6}$/i.test(value),
      initialValue: (_value, typed) => '#' + typed,
    }
    assert.equal(isAllowedCellValue(editor, '#ff8800'), true)
    assert.equal(isAllowedCellValue(editor, 'orange'), false)
    assert.equal(isAllowedCellValue(editor, ''), false)
    assert.equal(getInitialEditorValue(editor, 'old', 'f'), '#f')
    assert.equal(isAllowedCellValue({ type: 'number', validate: () => true }, 'custom'), true)
  })

  test('declared number and date inputs validate their representations', () => {
    assert.equal(isAllowedCellValue({ type: 'number' }, '123.45'), true)
    assert.equal(isAllowedCellValue({ type: 'number' }, '1e3'), true)
    assert.equal(isAllowedCellValue({ type: 'number' }, 'abc'), false)
    assert.equal(isAllowedCellValue({ type: 'date' }, '2024-02-29'), true)
    assert.equal(isAllowedCellValue({ type: 'date' }, '2026-02-29'), false)
  })
})
