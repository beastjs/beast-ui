import type { IconName } from '../../../lib/icons/icons.ts'

export type CellBadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'danger'

export interface CellBadgeAppearance {
  readonly label?: string
  readonly tone?: CellBadgeTone
  readonly icon?: IconName
  readonly className?: string
  /** Optional CSS colors override the tone's palette. */
  readonly color?: string
  readonly background?: string
  readonly borderColor?: string
}

/** Display configuration only; raw values remain unchanged for editing and sorting. */
export interface CellBadgeConfig extends Omit<CellBadgeAppearance, 'label'> {
  /** Exact raw values mapped to optional labels and appearances. */
  readonly values?: Readonly<Record<string, CellBadgeAppearance>>
}

export interface ResolvedCellBadge extends CellBadgeAppearance {
  readonly label: string
  readonly tone: CellBadgeTone
}

/** The shared renderer reads metadata without recognizing domain-specific values. */
export function getCellBadge(config: CellBadgeConfig | false | undefined, value: unknown): ResolvedCellBadge | undefined {
  if (!config || value === null || value === undefined) return undefined
  const text = String(value)
  if (text.trim() === '') return undefined
  const appearance = config.values && Object.hasOwn(config.values, text) ? config.values[text] : undefined
  return {
    label: appearance?.label ?? text,
    tone: appearance?.tone ?? config.tone ?? 'neutral',
    color: appearance?.color ?? config.color,
    background: appearance?.background ?? config.background,
    borderColor: appearance?.borderColor ?? config.borderColor,
    icon: appearance?.icon ?? config.icon,
    className: appearance?.className ?? config.className,
  }
}
