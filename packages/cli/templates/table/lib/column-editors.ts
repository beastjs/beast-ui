import type { CellEditorType } from '../ui/table/hyper/cell-editor.ts'
import { inferCellBadge } from './column-badges.ts'

export interface ColumnEditorInferenceOptions {
  numbers?: boolean
  dates?: boolean
  /** Disable category inference or tune it to the consumer's data. */
  selects?: false | { maxOptions?: number; maxUniqueRatio?: number }
}

/** Optional generation-time heuristics based only on values, never field names. */
export function inferCellEditor(values: readonly string[], config: ColumnEditorInferenceOptions = {}): CellEditorType {
  const populated = values.filter((value) => value.trim() !== '')
  if (populated.length === 0) return { type: 'text' }
  if (config.dates !== false && populated.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value)) {
    return { type: 'date' }
  }
  // Preserve leading-zero strings rather than coercing identifiers into numbers.
  if (config.numbers !== false && populated.every((value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    && Number.isFinite(Number(value)))) {
    return { type: 'number' }
  }
  if (config.selects !== false) {
    const options = [...new Set(populated)]
    const { maxOptions = 25, maxUniqueRatio = 0.5 } = config.selects ?? {}
    const stateValues = inferCellBadge(options) !== undefined
    if (options.length <= maxOptions && (stateValues || options.length / populated.length <= maxUniqueRatio)) {
      return { type: 'select', options }
    }
  }
  return { type: 'text' }
}
