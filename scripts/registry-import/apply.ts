import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { registryItemSchema, registrySchema, type Registry, type RegistryItem } from '@beast-ui/registry/schema'
import { toPascal } from './analyze.ts'

export interface ComponentPlan {
  name: string
  title: string
  description: string
  /** npm dependencies with ranges, e.g. `clsx@^2.1.1`. */
  dependencies: string[]
  registryDependencies: string[]
  variantOf?: string
  icon: string
  /** Component source after import rewrites. */
  content: string
}

export const paths = {
  registry: 'registry.json',
  registryPackage: 'packages/registry/package.json',
  source: (name: string) => `packages/registry/ui/${name}.btsx`,
  preview: (name: string) => `apps/web/src/previews/${name}-preview.btsx`,
  previews: 'apps/web/src/previews/index.ts',
}

export async function readRegistry(root: string): Promise<Registry> {
  return registrySchema.parse(JSON.parse(await readFile(path.join(root, paths.registry), 'utf8')))
}

export function catalogEntry(plan: ComponentPlan): RegistryItem {
  return registryItemSchema.parse({
    name: plan.name,
    type: 'registry:ui',
    title: plan.title,
    description: plan.description,
    ...(plan.dependencies.length ? { dependencies: plan.dependencies } : {}),
    ...(plan.registryDependencies.length ? { registryDependencies: plan.registryDependencies } : {}),
    files: [{ path: paths.source(plan.name), type: 'registry:ui' }],
    ...(plan.variantOf ? { meta: { variantOf: plan.variantOf } } : {}),
  })
}

/** Inserts or replaces an item. A new variant goes after its base's last variant. */
export function placeItem(items: RegistryItem[], item: RegistryItem): RegistryItem[] {
  const existing = items.findIndex((entry) => entry.name === item.name)
  if (existing !== -1) return items.map((entry, index) => (index === existing ? item : entry))
  const base = item.meta?.variantOf
  if (base === undefined) return [...items, item]
  let at = items.findIndex((entry) => entry.name === base)
  while (at + 1 < items.length && items[at + 1].meta?.variantOf === base) at++
  return [...items.slice(0, at + 1), item, ...items.slice(at + 1)]
}

// Drop keys the schema filled with defaults, so registry.json keeps its hand-written shape.
const serializeItem = (item: RegistryItem): Record<string, unknown> => {
  const { dependencies, registryDependencies, ...rest } = item
  return {
    name: rest.name, type: rest.type, title: rest.title, description: rest.description,
    ...(dependencies.length ? { dependencies } : {}),
    ...(registryDependencies.length ? { registryDependencies } : {}),
    files: rest.files, ...(rest.meta ? { meta: rest.meta } : {}),
  }
}

/** The starter preview the importer writes: the component and its description. */
export function previewSource(plan: Pick<ComponentPlan, 'name' | 'description'>): string {
  const component = toPascal(plan.name)
  return [
    `import ${component} from "@beast-ui/registry/ui/${plan.name}";`,
    '',
    'props {}:{}',
    'div(className="flex flex-col items-center gap-6")',
    `  ${component}`,
    `  p(className="max-w-md text-center text-xs leading-relaxed text-muted-foreground") ${plan.description}`,
    '',
  ].join('\n')
}

const previewKey = (name: string) => (/^[a-z][a-z0-9]*$/.test(name) ? name : `'${name}'`)

/** The icon a component is registered with in the previews index, if it is registered. */
export function registeredIcon(index: string, name: string): string | undefined {
  return new RegExp(`^  ${previewKey(name).replace(/[-']/g, (char) => `\\${char}`)}: \\{ icon: '([a-z0-9-]+)'`, 'm').exec(index)?.[1]
}

export function registerPreview(index: string, plan: Pick<ComponentPlan, 'name' | 'icon'>): string {
  const key = previewKey(plan.name)
  const line = `  ${key}: { icon: '${plan.icon}', component: lazy(() => import('./${plan.name}-preview.btsx')) },`
  const existing = new RegExp(`^  ${key.replace(/[-']/g, (char) => `\\${char}`)}: .*$`, 'm')
  if (existing.test(index)) return index.replace(existing, line)
  const close = index.lastIndexOf('\n}')
  if (close === -1) throw new Error(`Cannot find the previews map in ${paths.previews}`)
  return `${index.slice(0, close)}\n${line}${index.slice(close)}`
}

/** The plan's npm dependencies that packages/registry/package.json does not list yet. */
export async function missingPackages(root: string, plan: Pick<ComponentPlan, 'dependencies'>): Promise<[name: string, range: string][]> {
  const manifest = JSON.parse(await readFile(path.join(root, paths.registryPackage), 'utf8')) as { dependencies?: Record<string, string> }
  return plan.dependencies
    .map((dependency): [string, string] => { const at = dependency.lastIndexOf('@'); return at > 0 ? [dependency.slice(0, at), dependency.slice(at + 1)] : [dependency, 'latest'] })
    .filter(([name]) => manifest.dependencies?.[name] === undefined)
}

export const hasPreview = (root: string, name: string): Promise<boolean> =>
  readFile(path.join(root, paths.preview(name)), 'utf8').then(() => true, () => false)

/** Writes one component into the registry and showcase. Returns the files it changed. */
export async function applyComponent(root: string, plan: ComponentPlan): Promise<string[]> {
  const at = (relative: string) => path.join(root, relative)
  const changed: string[] = []

  await mkdir(path.dirname(at(paths.source(plan.name))), { recursive: true })
  await writeFile(at(paths.source(plan.name)), plan.content)
  changed.push(paths.source(plan.name))

  const registry = await readRegistry(root)
  const items = placeItem(registry.items, catalogEntry(plan))
  await writeFile(at(paths.registry), `${JSON.stringify({ ...registry, items: items.map(serializeItem) }, null, 2)}\n`)
  changed.push(paths.registry)

  const additions = await missingPackages(root, plan)
  if (additions.length) {
    const manifest = JSON.parse(await readFile(at(paths.registryPackage), 'utf8')) as { dependencies?: Record<string, string> }
    manifest.dependencies = Object.fromEntries(Object.entries({ ...manifest.dependencies, ...Object.fromEntries(additions) }).sort(([a], [b]) => a.localeCompare(b)))
    await writeFile(at(paths.registryPackage), `${JSON.stringify(manifest, null, 2)}\n`)
    changed.push(paths.registryPackage)
  }

  if (!(await hasPreview(root, plan.name))) {
    await writeFile(at(paths.preview(plan.name)), previewSource(plan))
    changed.push(paths.preview(plan.name))
  }
  await writeFile(at(paths.previews), registerPreview(await readFile(at(paths.previews), 'utf8'), plan))
  changed.push(paths.previews)
  return changed
}

export const removeStaged = (file: string): Promise<void> => rm(file)
