import type { CellBadgeConfig } from './cell-badge.ts'

interface CellEditorBehavior {
  /** Empty values are accepted unless the column declares them required. */
  readonly required?: boolean
  /** Consumer-defined validation replaces the built-in value check. */
  readonly validate?: (value: string) => boolean
  /** Consumer-defined keyboard entry behavior. */
  readonly initialValue?: (value: string, typed: string) => string
}

export type CellEditorType = CellEditorBehavior & (
  | { readonly type: 'text' | 'number' | 'date' }
  | { readonly type: 'select'; readonly options: readonly string[] }
)

/** Metadata supplied with each column definition; omitted editors default to text. */
export interface DataTableColumnMeta {
  /** Plain label for menus, filters and generated headers. */
  readonly headerText?: string
  /** False makes the column read-only while keeping its cells selectable. */
  readonly editor?: CellEditorType | false
  /** Opt-in pills; omitted or false keeps the configured cell renderer. */
  readonly badge?: CellBadgeConfig | false
  /** Consumers may attach their own metadata alongside editing configuration. */
  readonly [key: string]: unknown
}

/** Typing into a dropdown selects a matching option without inventing a new value. */
export function getInitialEditorValue(editor: CellEditorType | undefined, value: string, typed?: string): string {
  if (typed === undefined) return value
  if (editor?.initialValue) return editor.initialValue(value, typed)
  if (editor?.type === 'select') {
    return editor.options.find((option) => option.toLowerCase().startsWith(typed.toLowerCase())) ?? value
  }
  if (editor?.type === 'date' || (editor?.type === 'number' && !/\d/.test(typed))) return value
  return typed
}

export function isAllowedCellValue(editor: CellEditorType | false | undefined, value: string): boolean {
  if (editor === false || (editor?.required && value === '')) return false
  if (editor?.validate) return editor.validate(value)
  if (value === '') return true
  if (editor?.type === 'select') return editor.options.includes(value)
  if (editor?.type === 'number') return value.trim() !== '' && Number.isFinite(Number(value))
  if (editor?.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return true
}
