import { lazy, type ComponentBody } from 'octane'
import type { IconName } from '@beast-ui/icons'

export interface Preview {
  icon: IconName
  component: ComponentBody
}

// One entry per registry:ui item. Each preview loads only on its own page.
// Beast names a file's component after the file, so preview files end in
// `-preview` to keep that name from shadowing the component they import.
export const previews: Record<string, Preview> = {
  button: { icon: 'switch', component: lazy(() => import('./button-preview.btsx')) },
  'button-ripple': { icon: 'switch', component: lazy(() => import('./button-ripple-preview.btsx')) },
  'button-bouncy': { icon: 'switch', component: lazy(() => import('./button-bouncy-preview.btsx')) },
  scrubfield: { icon: 'timeline', component: lazy(() => import('./scrubfield-preview.btsx')) },
  squishy: { icon: 'spinner-ring', component: lazy(() => import('./squishy-preview.btsx')) },
  'call-chip': { icon: 'search', component: lazy(() => import('./call-chip-preview.btsx')) },
  alert: { icon: 'beast', component: lazy(() => import('./alert-preview.btsx')) },
  'aspect-ratio': { icon: 'mechanics', component: lazy(() => import('./aspect-ratio-preview.btsx')) },
  bubble: { icon: 'folder', component: lazy(() => import('./bubble-preview.btsx')) },
  checkbox: { icon: 'beast', component: lazy(() => import('./checkbox-preview.btsx')) },
  drawer: { icon: 'sidebar', component: lazy(() => import('./drawer-preview.btsx')) },
  popover: { icon: 'chevron-down', component: lazy(() => import('./popover-preview.btsx')) },
}
