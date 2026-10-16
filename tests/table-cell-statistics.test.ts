import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { getNumericCellStatistics } from '../packages/cli/templates/table/ui/table/hyper/cell-statistics.ts'

describe('selected numeric cell statistics', () => {
  test('calculates the sum and average of Taxes stored as decimal strings', () => {
    assert.deepEqual(getNumericCellStatistics(['162.00', '1824.75', '6412.50']), {
      count: 3, sum: 8399.25, average: 2799.75,
    })
  })

  test('includes zero, negative numbers, grouped decimals, and scientific notation', () => {
    assert.deepEqual(getNumericCellStatistics([0, -3, ' 1,200.50 ', '.5', '1e2']), {
      count: 5, sum: 1298, average: 259.6,
    })
  })

  test('mixed selections ignore blanks, text, identifiers, dates, and non-finite values', () => {
    assert.deepEqual(getNumericCellStatistics([
      '10.50', null, undefined, '', ' ', false, true, [], {}, '12abc',
      '00123', '2026-09-25', '+63 917 114 4622', '0x10', '1,2', '1e999', NaN, Infinity,
      '-2.50',
    ]), { count: 2, sum: 8, average: 4 })
    assert.equal(getNumericCellStatistics([]), null)
    assert.equal(getNumericCellStatistics(['Quote', '', null]), null)
  })

  test('zero totals and a single numeric cell still produce statistics', () => {
    assert.deepEqual(getNumericCellStatistics([4, -4]), { count: 2, sum: 0, average: 0 })
    assert.deepEqual(getNumericCellStatistics(['0.00']), { count: 1, sum: 0, average: 0 })
  })

  test('preserves small amounts when large positive and negative values cancel', () => {
    assert.deepEqual(getNumericCellStatistics([1e16, 1, -1e16]), {
      count: 3, sum: 1, average: 1 / 3,
    })
  })
})
