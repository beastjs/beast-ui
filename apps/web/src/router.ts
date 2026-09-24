import { createRootRoute, createRoute, createRouter, lazyRouteComponent, type RouteComponent } from '@octanejs/tanstack-router'
import type { ComponentBody } from 'octane'
import App from './App.btsx'

// lazyRouteComponent types `preload` as possibly returning undefined, which its
// own RouteComponent rejects. Normalize it without replacing the component.
function lazyPage(importer: () => Promise<{ default: ComponentBody }>): RouteComponent {
  const page = lazyRouteComponent(importer)
  const preload = page.preload
  return Object.assign(page, { preload: async (): Promise<void> => { await preload() } })
}

const rootRoute = createRootRoute({ component: App })

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: lazyPage(() => import('./pages/Home.btsx')) })
const componentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/components/$name', component: lazyPage(() => import('./pages/Component.btsx')) })

const routeTree = rootRoute.addChildren([indexRoute, componentRoute])

// Preload a route's chunk when its link is hovered or focused.
export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@octanejs/tanstack-router' {
  interface Register {
    router: typeof router
  }
}
