import type { CellEditorType } from './cell-editor.ts'
import type { CellAddress } from './cell-selection.ts'

/** The selection and editing callbacks consumed by one rendered data cell. */
export interface CellInteraction {
  selected: boolean
  active: boolean
  editing: boolean
  editable: boolean
  dragging: boolean
  editor?: CellEditorType
  address: CellAddress
  /** Keyboard entry point when there is no active cell yet. */
  tabbable?: boolean
  /** Value to start editing with; a typed character can replace the cell value. */
  value: string
  label: string
  onSelect: (event: MouseEvent) => void
  onPointerDown: (event: PointerEvent) => void
  onFocus?: () => void
  onStartEdit: (initialValue?: string) => void
  onCommit: (value: string, move?: 'up' | 'down' | 'left' | 'right') => void
  onCancel: () => void
  onKeyDown: (event: KeyboardEvent) => void
}
