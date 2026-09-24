import { afterEach, describe, expect, test } from 'bun:test'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeComponent, toItemName, toTitle, type CatalogEntry } from '../scripts/registry-import/analyze.ts'
import { applyComponent, missingPackages, paths, placeItem, readRegistry, registerPreview, type ComponentPlan } from '../scripts/registry-import/apply.ts'
import { buildRegistry } from '../scripts/build-registry.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })

async function catalog(): Promise<Map<string, CatalogEntry>> {
  return new Map((await readRegistry(root)).items.map((item) => [item.name, { ...item, variantOf: item.meta?.variantOf }]))
}

/** A throwaway copy of the files the importer reads and writes. */
async function workspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beast-ui-import-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  for (const file of [paths.registry, paths.registryPackage, paths.previews]) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await cp(path.join(root, file), path.join(dir, file))
  }
  await cp(path.join(root, 'packages/registry/ui'), path.join(dir, 'packages/registry/ui'), { recursive: true })
  await cp(path.join(root, 'packages/registry/lib'), path.join(dir, 'packages/registry/lib'), { recursive: true })
  await cp(path.join(root, 'packages/registry/styles'), path.join(dir, 'packages/registry/styles'), { recursive: true })
  return dir
}

const plan = (overrides: Partial<ComponentPlan> = {}): ComponentPlan => ({
  name: 'button-glow',
  title: 'Glow Button',
  description: 'A button with a soft glow.',
  dependencies: ['@octanejs/motion@^0.1.54'],
  registryDependencies: ['button'],
  variantOf: 'button',
  icon: 'switch',
  content: 'import Button from "./button.btsx";\n\nprops {...props}: {}\nButton({...props})\n',
  ...overrides,
})

describe('registry import analysis', () => {
  test('names items and titles from file names', () => {
    expect(toItemName('RippleButton.btsx')).toBe('ripple-button')
    expect(toItemName('call_chip.btsx')).toBe('call-chip')
    expect(toTitle('button-ripple')).toBe('Button Ripple')
  })

  test('maps imports to registry and npm dependencies and fixes paths that break once installed', async () => {
    const source = [
      'import { useState } from "octane";',
      'import { motion } from "@octanejs/motion";',
      'import type { Button as Primitive } from "@octanejs/base-ui/button";',
      "import Button from '@/components/ui/button';",
      'import { cn } from "../lib/utils";',
      'import { toast } from "sonner";',
      '',
      'props {}:{}',
      'div(className="bg-primary text-primary-foreground")',
    ].join('\n')
    const result = analyzeComponent('button-glow.btsx', source, await catalog(), new Set())
    expect(result.registryDependencies.sort()).toEqual(['button', 'theme', 'utils'])
    // base-ui is a type-only import that button already installs; octane is the runtime.
    expect(result.packages.sort()).toEqual(['@octanejs/motion', 'sonner'])
    expect(result.content).toContain(`import Button from './button.btsx';`)
    expect(result.content).toContain('import { cn } from "@/lib/utils";')
    expect(result.suggestedVariantOf).toBe('button')
    expect(result.warnings).toEqual([])
  })

  test('warns about imports that cannot be resolved in a user project', async () => {
    const result = analyzeComponent('widget.btsx', 'import { thing } from "@/hooks/thing";\nimport x from "../shared/x";\n', await catalog(), new Set())
    expect(result.imports.filter((entry) => entry.kind === 'unknown')).toHaveLength(2)
    expect(result.warnings).toHaveLength(2)
  })

  test('recognizes imports of other staged components', async () => {
    const result = analyzeComponent('card-flip.btsx', 'import Card from "./card.btsx";\n', await catalog(), new Set(['card', 'card-flip']))
    expect(result.registryDependencies).toEqual(['card'])
  })
})

describe('registry import apply', () => {
  test('writes the component, catalog entry, npm dependency, and a registered preview', async () => {
    const dir = await workspace()
    await mkdir(path.join(dir, 'apps/web/src/previews'), { recursive: true })
    const changed = await applyComponent(dir, plan({ dependencies: ['@octanejs/motion@^0.1.54', 'sonner@^2.0.0'] }))
    expect(changed).toEqual([paths.source('button-glow'), paths.registry, paths.registryPackage, paths.preview('button-glow'), paths.previews])

    const registry = await readRegistry(dir)
    const names = registry.items.map((item) => item.name)
    expect(names.indexOf('button-glow')).toBe(names.indexOf('button-bouncy') + 1)
    expect(registry.items.find((item) => item.name === 'button-glow')?.meta).toEqual({ variantOf: 'button' })

    const manifest = JSON.parse(await readFile(path.join(dir, paths.registryPackage), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies.sonner).toBe('^2.0.0')
    expect(manifest.dependencies['@octanejs/motion']).toBe('^0.1.54')

    expect(await readFile(path.join(dir, paths.preview('button-glow')), 'utf8')).toContain('import ButtonGlow from "@beast-ui/registry/ui/button-glow";')
    expect(await readFile(path.join(dir, paths.previews), 'utf8')).toContain(`'button-glow': { icon: 'switch', component: lazy(() => import('./button-glow-preview.btsx')) },`)

    // The result must pass the same validation as the real registry build.
    await buildRegistry(dir, path.join(dir, 'out'))
  })

  test('replacing an existing item updates it in place', async () => {
    const dir = await workspace()
    await mkdir(path.join(dir, 'apps/web/src/previews'), { recursive: true })
    await applyComponent(dir, plan())
    await applyComponent(dir, plan({ description: 'Updated.', icon: 'theme' }))
    const registry = await readRegistry(dir)
    expect(registry.items.filter((item) => item.name === 'button-glow')).toHaveLength(1)
    expect(registry.items.find((item) => item.name === 'button-glow')?.description).toBe('Updated.')
    const index = await readFile(path.join(dir, paths.previews), 'utf8')
    expect(index.match(/button-glow-preview/g)).toHaveLength(1)
    expect(index).toContain(`'button-glow': { icon: 'theme'`)
  })

  test('plans only npm dependencies the registry package does not list', async () => {
    const missing = await missingPackages(root, { dependencies: ['@octanejs/motion@^0.1.54', 'sonner', '@scope/pkg', 'left-pad@^1.3.0'] })
    expect(missing).toEqual([['sonner', 'latest'], ['@scope/pkg', 'latest'], ['left-pad', '^1.3.0']])
  })

  test('places a new base component at the end', async () => {
    const items = (await readRegistry(root)).items
    const fresh = { ...items[0], name: 'import-test-component', meta: undefined }
    expect(placeItem(items, fresh).at(-1)?.name).toBe('import-test-component')
  })

  test('registers unquoted keys for single-word names', () => {
    const index = "export const previews: Record<string, Preview> = {\n  button: { icon: 'switch', component: lazy(() => import('./button-preview.btsx')) },\n}\n"
    expect(registerPreview(index, plan({ name: 'card', icon: 'folder' }))).toContain("  card: { icon: 'folder', component: lazy(() => import('./card-preview.btsx')) },\n}")
  })
})
