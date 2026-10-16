import type { CellBadgeAppearance, CellBadgeConfig, CellBadgeTone } from '../ui/table/hyper/cell-badge.ts'

// These optional generation-time hints describe common values, never header names.
const STATUS_GROUPS: ReadonlyArray<readonly [CellBadgeTone, readonly string[]]> = [
  ['success', ['active', 'enabled', 'true', 'yes', 'on', 'approved', 'accepted', 'verified', 'completed', 'complete',
    'done', 'success', 'successful', 'arrived', 'delivered', 'paid', 'published', 'confirmed', 'resolved', 'ready']],
  ['warning', ['pending', 'waiting', 'queued', 'scheduled', 'on hold', 'paused', 'overdue']],
  ['info', ['processing', 'in progress', 'submitted', 'in review', 'under review', 'in transit', 'shipped', 'claimed']],
  ['danger', ['rejected', 'failed', 'error', 'blocked', 'cancelled', 'canceled', 'denied']],
  ['neutral', ['inactive', 'disabled', 'false', 'no', 'off', 'draft', 'quote', 'new', 'created', 'not started',
    'expired', 'archived', 'closed', 'returned', 'refunded']],
]
const STATUS_TONES: Readonly<Record<string, CellBadgeTone>> = Object.fromEntries(
  STATUS_GROUPS.flatMap(([tone, values]) => values.map((value) => [value, tone])),
)

// Match LiveSnaps' status presentations while keeping recognition at generation
// time. The shared cell renderer only reads the resulting column metadata.
const DEFAULT_ICONS: Record<CellBadgeTone, NonNullable<CellBadgeAppearance['icon']>> = {
  neutral: 'circle-minus', success: 'circle-check', warning: 'pending', info: 'pending', danger: 'circle-minus',
}
const GREEN = 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
const INDIGO = 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
const DRAFT = 'border-taupe-500/30 bg-taupe-500/8 text-taupe-700 dark:text-taupe-300'
const CANCELLED = 'border-mauve-500/15 bg-mauve-500/8 text-mauve-600 dark:text-mauve-400'
const REJECTED = 'border-rose-500/15 bg-rose-500/8 text-rose-600 dark:text-rose-400'
const STATUS_APPEARANCES: Readonly<Record<string, CellBadgeAppearance>> = {
  active: {
    icon: 'bolt',
    color: 'oklch(0.6278 0.204 254.62)',
    background: 'oklch(0.6278 0.204 254.62 / 0.08)',
    borderColor: 'oklch(0.6278 0.204 254.62 / 0.25)',
  },
  verified: { icon: 'safe-shield', className: INDIGO },
  submitted: { icon: 'send', className: GREEN },
  completed: { icon: 'circle-check', className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400' },
  pending: { icon: 'pending', className: 'border-orange-500/50 bg-orange-500/8 text-orange-700 dark:text-orange-300' },
  draft: { icon: 'draft', className: DRAFT },
  quote: { icon: 'draft', className: DRAFT },
  'not started': { icon: 'not-started', className: 'border-mist-500/10 bg-mist-500/10 text-mist-600 dark:text-mist-400' },
  abandoned: { icon: 'alert-triangle', className: 'border-slate-500/15 bg-slate-500/8 text-slate-600 dark:text-slate-400' },
  cancelled: { icon: 'octagon', className: CANCELLED },
  canceled: { icon: 'octagon', className: CANCELLED },
  rejected: { icon: 'circle-minus', className: REJECTED },
  invalidated: { icon: 'circle-minus', className: REJECTED },
  failed: { icon: 'cancel', className: 'border-rose-500 bg-rose-500/8 text-rose-700 dark:text-rose-300' },
}

/** Infer badges only when all populated values look like statuses or boolean states. */
export function inferCellBadge(values: readonly string[]): CellBadgeConfig | undefined {
  const populated = [...new Set(values.filter((value) => value.trim() !== ''))]
  if (populated.length === 0) return undefined
  const appearances: Array<[string, CellBadgeAppearance]> = []
  for (const value of populated) {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    if (!Object.hasOwn(STATUS_TONES, normalized) && !Object.hasOwn(STATUS_APPEARANCES, normalized)) return undefined
    const tone = STATUS_TONES[normalized] ?? (normalized === 'invalidated' ? 'danger' : 'neutral')
    appearances.push([value, { tone, icon: DEFAULT_ICONS[tone], ...STATUS_APPEARANCES[normalized] }])
  }
  return { values: Object.fromEntries(appearances) }
}
