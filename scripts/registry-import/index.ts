import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createInterface, type Interface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { itemNameSchema } from '@beast-ui/registry/schema'
import { paint, symbols } from '../../packages/cli/src/utils/ui.ts'
import { analyzeComponent, parseImports, toItemName, toTitle, type CatalogEntry, type ParsedImport } from './analyze.ts'
import { applyComponent, hasPreview, missingPackages, paths, readRegistry, removeStaged, type ComponentPlan } from './apply.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const stagingDir = path.resolve(root, process.argv[2] ?? 'staging')
const run = promisify(execFile)
const DEPENDENCY = /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*(?:@[~^<>=0-9a-zA-Z.*|+ -]+)?$/

const say = (text = '') => { process.stdout.write(`${text}\n`) }
const fail = (text: string) => say(`    ${paint('red', symbols.fail)} ${text}`)
const list = (answer: string): string[] => (answer === '-' ? [] : answer.split(/[\s,]+/).filter(Boolean))

interface AskOptions {
  initial?: string
  required?: boolean
  hint?: string
  validate?: (answer: string) => string | undefined
}

async function ask(prompt: Interface, label: string, options: AskOptions = {}): Promise<string> {
  for (;;) {
    const shown = options.initial ? paint('dim', ` (${options.initial})`) : ''
    const hint = options.hint ? paint('dim', ` ${options.hint}`) : ''
    const answer = (await prompt.question(`  ${paint('cyan', '?')} ${label}${shown}${hint} `)).trim() || options.initial || ''
    if (!answer && options.required) { fail('Required.'); continue }
    const error = options.validate?.(answer)
    if (error) { fail(error); continue }
    return answer
  }
}

async function confirm(prompt: Interface, label: string, initial: boolean): Promise<boolean> {
  for (;;) {
    const answer = (await prompt.question(`  ${paint('cyan', '?')} ${label} ${paint('dim', initial ? '(Y/n)' : '(y/N)')} `)).trim().toLowerCase()
    if (answer === '') return initial
    if (/^(y|yes|n|no)$/.test(answer)) return answer.startsWith('y')
    fail('Answer y or n.')
  }
}

/** Version ranges already used in the workspace, so new components match them. */
async function workspaceRanges(): Promise<Map<string, string>> {
  const ranges = new Map<string, string>()
  for (const manifest of ['package.json', 'packages/registry/package.json', 'apps/web/package.json', 'apps/docs/package.json']) {
    const json = JSON.parse(await readFile(path.join(root, manifest), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    for (const [name, range] of Object.entries({ ...json.devDependencies, ...json.dependencies })) {
      if (!range.startsWith('workspace:') && !ranges.has(name)) ranges.set(name, range)
    }
  }
  return ranges
}

async function resolveRange(name: string, ranges: Map<string, string>): Promise<string> {
  const known = ranges.get(name)
  if (known) return `${name}@${known}`
  try {
    const { stdout } = await run('npm', ['view', name, 'version'], { timeout: 20_000 })
    return `${name}@^${stdout.trim()}`
  } catch {
    return name
  }
}

function describeImport(entry: ParsedImport): string {
  const type = entry.typeOnly ? paint('dim', ' (type)') : ''
  const rewrite = entry.rewriteTo ? paint('yellow', ` → rewritten to ${entry.rewriteTo}`) : ''
  const label = {
    runtime: paint('dim', 'Beast runtime, nothing to add'),
    utils: 'registry item utils',
    component: `registry item ${entry.target}`,
    package: `npm package ${entry.target}`,
    unknown: paint('red', 'cannot be resolved once installed'),
  }[entry.kind]
  return `    ${paint('cyan', symbols.item)} ${entry.specifier}${type}  ${paint('dim', '·')} ${label}${rewrite}`
}

/** Staged files that import another staged file come after it. */
function orderStaged(files: { name: string; source: string }[], catalog: Map<string, CatalogEntry>): { name: string; source: string }[] {
  const staged = new Set(files.map((file) => file.name))
  const needs = new Map(files.map((file) => [file.name, parseImports(file.source, catalog, staged)
    .flatMap((entry) => entry.kind === 'component' && entry.target && staged.has(entry.target) && entry.target !== file.name ? [entry.target] : [])]))
  const ordered: { name: string; source: string }[] = []
  const visit = (file: { name: string; source: string }, trail: Set<string>) => {
    if (ordered.includes(file) || trail.has(file.name)) return
    trail.add(file.name)
    for (const dependency of needs.get(file.name) ?? []) {
      const next = files.find((candidate) => candidate.name === dependency)
      if (next) visit(next, trail)
    }
    ordered.push(file)
  }
  files.forEach((file) => visit(file, new Set()))
  return ordered
}

async function iconNames(): Promise<string[]> {
  const source = await readFile(path.join(root, 'apps/web/src/lib/icons/icons.ts'), 'utf8')
  return [...source.matchAll(/^ {2}'?([a-z][a-z0-9-]*)'?: ?\{/gm)].map((match) => match[1])
}

async function runStep(label: string, command: string, args: string[]): Promise<boolean> {
  process.stdout.write(`  ${paint('dim', '…')} ${label}`)
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    const output: string[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()))
    child.once('close', (code) => {
      process.stdout.write(`\r\x1b[2K`)
      if (code === 0) { say(`  ${paint('green', symbols.ok)} ${label}`); resolve(true); return }
      say(`  ${paint('red', symbols.fail)} ${label}`)
      say(paint('dim', output.join('').trim().split('\n').slice(-15).map((line) => `    ${line}`).join('\n')))
      resolve(false)
    })
  })
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) throw new Error('registry:import is interactive. Run it in a terminal.')
  await mkdir(stagingDir, { recursive: true })
  const relativeStaging = path.relative(root, stagingDir) || '.'
  const entries = (await readdir(stagingDir)).filter((file) => !file.startsWith('.')).sort()
  const ignored = entries.filter((file) => !file.endsWith('.btsx'))

  say()
  say(`  ${paint('magenta', symbols.brand)} ${paint('bold', 'beast-ui')} ${paint('dim', `registry import · ${relativeStaging}/`)}`)
  say()
  for (const file of ignored) say(`  ${paint('dim', `${symbols.keep} ${file} is not a .btsx component; left in place`)}`)
  const components = entries.filter((file) => file.endsWith('.btsx'))
  if (!components.length) {
    say(`  ${paint('dim', `Nothing to import. Drop .btsx components into ${relativeStaging}/ and run this again.`)}`)
    say()
    return
  }

  const initialCatalog = new Map((await readRegistry(root)).items.map((item) => [item.name, { ...item, variantOf: item.meta?.variantOf }]))
  const staged = await Promise.all(components.map(async (file) => ({ file, name: toItemName(file), source: await readFile(path.join(stagingDir, file), 'utf8') })))
  const queue = orderStaged(staged, initialCatalog).map((entry) => staged.find((file) => file.name === entry.name)!)
  const ranges = await workspaceRanges()
  const icons = await iconNames()
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const written: string[] = []
  let packagesChanged = false

  try {
    for (const [index, current] of queue.entries()) {
      // Re-read each time: earlier components in this session are now in the catalog.
      const catalog: Map<string, CatalogEntry> = new Map((await readRegistry(root)).items.map((item) => [item.name, { ...item, variantOf: item.meta?.variantOf }]))
      const remaining = new Set(queue.slice(index).map((file) => file.name))
      const analysis = analyzeComponent(current.file, current.source, catalog, remaining)

      say(`  ${paint('bold', `[${index + 1}/${queue.length}]`)} ${paint('bold', current.file)}`)
      say()
      if (analysis.imports.length) {
        say(`  ${paint('dim', 'Imports')}`)
        analysis.imports.forEach((entry) => say(describeImport(entry)))
        say()
      }
      for (const warning of analysis.warnings) say(`  ${paint('yellow', '!')} ${warning}`)
      if (analysis.warnings.length) say()
      if (analysis.imports.some((entry) => entry.kind === 'unknown') && !(await confirm(prompt, 'This file has imports that break once installed. Continue anyway?', false))) {
        say(`  ${paint('dim', `Skipped ${current.file}; it stays in ${relativeStaging}/.`)}`)
        say()
        continue
      }

      let name = ''
      for (;;) {
        name = await ask(prompt, 'Name', { initial: analysis.suggestedName, validate: (value) => itemNameSchema.safeParse(value).success ? undefined : 'Use lowercase words joined by hyphens, e.g. ripple-button.' })
        if (!catalog.has(name)) break
        if (catalog.get(name)?.type !== 'registry:ui') { fail(`${name} is a ${catalog.get(name)?.type} item. Choose another name.`); continue }
        if (await confirm(prompt, `${name} already exists. Replace it?`, false)) break
      }
      const title = await ask(prompt, 'Title', { initial: name === analysis.suggestedName ? analysis.suggestedTitle : toTitle(name) })
      const description = await ask(prompt, 'Description', { required: true, hint: 'one sentence, shown in list and on the site' })

      const bases = [...catalog.values()].filter((item) => item.type === 'registry:ui' && item.variantOf === undefined && item.name !== name).map((item) => item.name)
      const variantAnswer = await ask(prompt, 'Variant of', {
        initial: analysis.suggestedVariantOf ?? '-',
        hint: `- for none · ${bases.join(', ')}`,
        validate: (value) => value === '-' || bases.includes(value) ? undefined : `Choose one of: ${bases.join(', ')}, or - for none.`,
      })
      const variantOf = variantAnswer === '-' ? undefined : variantAnswer

      const knownItems = new Set([...catalog.keys(), ...remaining])
      const suggestedDependencies = [...new Set([...analysis.registryDependencies, ...(variantOf ? [variantOf] : [])])]
      const registryDependencies = list(await ask(prompt, 'Registry dependencies', {
        initial: suggestedDependencies.join(', ') || '-',
        hint: '- for none',
        validate: (value) => {
          const unknown = list(value).filter((item) => !knownItems.has(item) || item === name)
          if (unknown.length) return `Not in the registry: ${unknown.join(', ')}.`
          if (variantOf && !list(value).includes(variantOf)) return `A variant must depend on its base, ${variantOf}.`
          return undefined
        },
      }))

      const suggestedPackages = await Promise.all(analysis.packages.map((pkg) => resolveRange(pkg, ranges)))
      const dependencies = list(await ask(prompt, 'npm dependencies', {
        initial: suggestedPackages.join(', ') || '-',
        hint: '- for none',
        validate: (value) => {
          const invalid = list(value).filter((item) => !DEPENDENCY.test(item))
          return invalid.length ? `Use name or name@range: ${invalid.join(', ')}.` : undefined
        },
      }))

      const baseIcon = variantOf ? (await readFile(path.join(root, paths.previews), 'utf8')).match(new RegExp(`^  '?${variantOf}'?: \\{ icon: '([a-z0-9-]+)'`, 'm'))?.[1] : undefined
      const icon = await ask(prompt, 'Showcase icon', {
        initial: baseIcon ?? 'folder',
        hint: icons.join(', '),
        validate: (value) => icons.includes(value) ? undefined : `Choose one of: ${icons.join(', ')}.`,
      })

      const plan: ComponentPlan = { name, title, description, dependencies, registryDependencies, variantOf, icon, content: analysis.content }
      say()
      say(`  ${paint('dim', 'Plan')}`)
      say(`    ${paint('green', symbols.create)} ${paths.source(name)}`)
      const kind = catalog.has(name) ? 'replaces the existing item' : variantOf ? `variant of ${variantOf}` : 'new component'
      say(`    ${paint('yellow', symbols.replace)} ${paths.registry} ${paint('dim', `(${kind})`)}`)
      const additions = await missingPackages(root, plan)
      if (additions.length) say(`    ${paint('yellow', symbols.replace)} ${paths.registryPackage} ${paint('dim', `(adds ${additions.map(([pkg]) => pkg).join(', ')})`)}`)
      if (await hasPreview(root, name)) say(`    ${paint('dim', `${symbols.keep} ${paths.preview(name)} (exists; kept)`)}`)
      else say(`    ${paint('green', symbols.create)} ${paths.preview(name)} ${paint('dim', '(starter preview; fill it in)')}`)
      say(`    ${paint('yellow', symbols.replace)} ${paths.previews}`)
      say()

      const action = (await ask(prompt, 'Write it?', { initial: 'y', hint: 'y · s to skip · q to quit', validate: (value) => /^[ysq]$/i.test(value) ? undefined : 'Answer y, s, or q.' })).toLowerCase()
      if (action === 'q') { say(); break }
      if (action === 's') {
        say(`  ${paint('dim', `Skipped ${current.file}; it stays in ${relativeStaging}/.`)}`)
        say()
        continue
      }
      const changed = await applyComponent(root, plan)
      await removeStaged(path.join(stagingDir, current.file))
      packagesChanged ||= changed.includes(paths.registryPackage)
      written.push(name)
      say(`  ${paint('green', symbols.ok)} Added ${name} ${paint('dim', `· ${changed.length} files changed · removed from ${relativeStaging}/`)}`)
      say()
    }
  } finally {
    prompt.close()
  }

  if (written.length) {
    if (packagesChanged) await runStep('Installed new npm dependencies', 'bun', ['install'])
    const built = await runStep('Rebuilt and validated the registry', 'bun', ['scripts/build-registry.ts'])
    say()
    say(`  ${paint(built ? 'green' : 'yellow', symbols.brand)} ${paint('bold', `Imported ${written.join(', ')}.`)}`)
    say(`    ${paint('dim', 'Next: fill in each starter preview in apps/web/src/previews, check it with bun run dev, then run bun run check.')}`)
  }
  const left = (await readdir(stagingDir)).filter((file) => file.endsWith('.btsx'))
  say(left.length
    ? `    ${paint('dim', `${left.length} left in ${relativeStaging}/: ${left.join(', ')}`)}`
    : `    ${paint('dim', `No components left in ${relativeStaging}/.`)}`)
  say()
}

try {
  await main()
} catch (error) {
  say(`  ${paint('red', symbols.fail)} ${error instanceof Error ? error.message : String(error)}`)
  say()
  process.exitCode = 1
}
