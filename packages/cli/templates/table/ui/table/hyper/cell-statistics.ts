export interface NumericCellStatistics {
  count: number
  sum: number
  average: number
}

// Accept decimal values and conventional thousands separators. Do not coerce
// blanks, dates, booleans, or leading-zero identifiers into numbers.
const DECIMAL = /^[+-]?(?:(?:0|[1-9]\d*)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const GROUPED_DECIMAL = /^[+-]?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!DECIMAL.test(text) && !GROUPED_DECIMAL.test(text)) return null
  const number = Number(text.replaceAll(',', ''))
  return Number.isFinite(number) ? number : null
}

export function getNumericCellStatistics(values: Iterable<unknown>): NumericCellStatistics | null {
  let count = 0
  let sum = 0
  let correction = 0
  for (const value of values) {
    const number = numericValue(value)
    if (number === null) continue
    const next = sum + number
    // Keep small amounts when selected values have very different magnitudes.
    correction += Math.abs(sum) >= Math.abs(number)
      ? (sum - next) + number
      : (number - next) + sum
    sum = next
    count += 1
  }
  if (count === 0) return null
  const total = sum + correction
  return { count, sum: total, average: total / count }
}
