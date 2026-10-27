import { type ColumnDef, sortFn_alphanumeric } from '@octanejs/tanstack-table'
import ColumnHeaderLabel from '../ui/table/hyper/ColumnHeaderLabel.btsx'
import type { LabelledColumn } from '../ui/table/hyper/table-contract.ts'
import { features } from '../ui/table/hyper/features'
import { inferCellEditor, type ColumnEditorInferenceOptions } from './column-editors.ts'
import type { CellEditorType } from '../ui/table/hyper/cell-editor.ts'
import { inferCellBadge } from './column-badges.ts'
import type { CellBadgeConfig } from '../ui/table/hyper/cell-badge.ts'

import type { SheetRow } from './sheets.ts'

export interface GeneratedColumnContext {
  id: string
  name: string
  index: number
  values: readonly string[]
  inferredEditor: CellEditorType
  inferredBadge: CellBadgeConfig | undefined
}

export interface BuildColumnsOptions {
  /** Inference is a generation-time convenience and can be disabled or tuned. */
  inferEditors?: false | ColumnEditorInferenceOptions
  /** Return an editor override, false for read-only, or undefined to use inference. */
  editor?: (column: GeneratedColumnContext) => CellEditorType | false | undefined
  /** Disable optional status/boolean badge inference. */
  inferBadges?: boolean
  /** Configure pills for any values, return false for plain text, or undefined for inference. */
  badge?: (column: GeneratedColumnContext) => CellBadgeConfig | false | undefined
}

export function buildColumns(
  names: readonly string[],
  rows: readonly (readonly string[])[] = [],
  options: BuildColumnsOptions = {},
): Array<ColumnDef<typeof features, SheetRow>> {
  return names.map((name, index) => {
    const id = `col-${index}`
    const values = rows.map((row) => row[index] ?? '')
    const inferredEditor: CellEditorType = options.inferEditors === false
      ? { type: 'text' } : inferCellEditor(values, options.inferEditors)
    const inferredBadge = options.inferBadges === false ? undefined : inferCellBadge(values)
    const context = { id, name, index, values, inferredEditor, inferredBadge }
    const override = options.editor?.(context)
    const badgeOverride = options.badge?.(context)
    return {
      id,
      // flexRender renders the compiled component with only the header context;
      // its type also lists Octane's internal render arguments.
      header: ColumnHeaderLabel as unknown as (context: { column: LabelledColumn }) => unknown,
      accessorFn: (row) => row[index] ?? '',
      meta: {
        headerText: name,
        editor: override === undefined ? inferredEditor : override,
        badge: badgeOverride === undefined ? inferredBadge : badgeOverride,
      },
      sortFn: sortFn_alphanumeric,
      filterFn: 'arrHas',
      size: 200,
      minSize: 80,
    }
  })
}
