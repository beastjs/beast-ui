import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { initTable } from '../packages/cli/src/commands/table.ts'
import { compileBeast } from 'beast-tsrx'
import { tableAssets } from '../packages/cli/src/table-assets.ts'
import { jsonSheetDocument, parseTextDocument, parseMarkdownTable } from '../packages/cli/templates/table/lib/sheets.ts'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function project(octane = '0.4.3') {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'table-init-'))
  dirs.push(cwd)
  await mkdir(path.join(cwd, 'src'), { recursive: true })
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ name: 'example', scripts: { dev: 'vite' }, dependencies: { octane } }))
  await writeFile(path.join(cwd, 'src/style.css'), '@import "tailwindcss";\n:root { --brand: red; }\n')
  return cwd
}
const quiet = { log: () => {} }

test('installs the complete isolated feature, wires CSS once, and preserves the host icons, manifest, and styles', async () => {
  const cwd = await project()
  await mkdir(path.join(cwd, 'src/lib/icons'), { recursive: true })
  await writeFile(path.join(cwd, 'src/lib/icons/index.ts'), 'my icons')
  await writeFile(path.join(cwd, 'pnpm-lock.yaml'), '')
  const original = await readFile(path.join(cwd, 'package.json'), 'utf8')
  const installs: string[][] = []
  const install = async (target: string, manager: string, dependencies: string[]) => {
    expect(target).toBe(cwd); expect(manager).toBe('pnpm'); installs.push(dependencies)
  }
  const files = await initTable({ cwd, install, ...quiet })
  expect(files.filter(file => file.status === 'create')).toHaveLength(Object.keys(tableAssets.files).length)
  expect(installs[0]).toContain('@octanejs/tanstack-table@0.1.54')
  expect(installs[0]).toContain('xlsx@0.18.5')
  expect(installs[0]?.some(name => name.startsWith('octane@'))).toBe(false)
  const css = await readFile(path.join(cwd, 'src/style.css'), 'utf8')
  expect(css).toStartWith('@import "./components/table/table.css";')
  expect(css).toContain(':root { --brand: red; }')
  expect(await readFile(path.join(cwd, 'package.json'), 'utf8')).toBe(original)
  expect(await readFile(path.join(cwd, 'src/lib/icons/index.ts'), 'utf8')).toBe('my icons')
  const again = await initTable({ cwd, skipInstall: true, ...quiet })
  expect(again.every(file => file.status === 'keep')).toBe(true)
  expect(await readFile(path.join(cwd, 'src/style.css'), 'utf8')).toBe(css)
})

for (const [runtime, tableVersion] of [['0.2.13', '0.1.51'], ['0.3.2', '0.1.53'], ['0.4.3', '0.1.54'], ['0.8.0', '0.1.58'], ['0.12.1', '0.1.63'], ['0.16.0', '0.1.63']]) {
  test(`selects adapter releases compatible with Octane ${runtime}`, async () => {
    const cwd = await project(runtime)
    const logs: string[] = []
    await initTable({ cwd, dryRun: true, log: line => logs.push(line) })
    expect(logs.join('\n')).toContain(`@octanejs/tanstack-table@${tableVersion}`)
    expect(await readdir(path.join(cwd, 'src'))).toEqual(['style.css'])
  })
}

test('Octane 0.16 passes --legacy-peer-deps to npm only', async () => {
  for (const [manager, flags] of [['npm', ['--legacy-peer-deps']], ['bun', []]] as const) {
    const cwd = await project('0.16.0')
    const calls: string[][] = []
    await initTable({ cwd, packageManager: manager, install: async (_cwd, _manager, _deps, extra = []) => { calls.push(extra) }, ...quiet })
    expect(calls).toEqual([[...flags]])
  }
})

test('dry run reports every conflict and leaves CSS, dependencies, and files untouched', async () => {
  const cwd = await project()
  await mkdir(path.join(cwd, 'src/components/table'), { recursive: true })
  await writeFile(path.join(cwd, 'src/components/table/table.btsx'), 'custom viewer')
  const css = await readFile(path.join(cwd, 'src/style.css'), 'utf8')
  const install = async () => { throw new Error('must not install') }
  const files = await initTable({ cwd, dryRun: true, install, ...quiet })
  expect(files.find(file => file.path.endsWith('table/table.btsx'))?.status).toBe('conflict')
  await expect(initTable({ cwd, install, ...quiet })).rejects.toThrow('No files were changed')
  expect(await readFile(path.join(cwd, 'src/style.css'), 'utf8')).toBe(css)
  expect(await readFile(path.join(cwd, 'src/components/table/table.btsx'), 'utf8')).toBe('custom viewer')
})

test('supports a custom source path and Tailwind entry without needing aliases', async () => {
  const cwd = await project()
  await initTable({ cwd, path: 'src/features/table', css: 'src/style.css', skipInstall: true, ...quiet })
  expect(await readFile(path.join(cwd, 'src/style.css'), 'utf8')).toContain('./features/table/table.css')
  expect(await readFile(path.join(cwd, 'src/features/table/table.css'), 'utf8')).toContain('@source "./";')
  for (const content of Object.values(tableAssets.files)) expect(content).not.toMatch(/(?:from\s*|import\s*\()["']@\//)
})

test('refuses traversal and symlinks before mutation', async () => {
  const cwd = await project()
  const outside = await project()
  await symlink(outside, path.join(cwd, 'src/linked'))
  await expect(initTable({ cwd, path: 'src/../escape', skipInstall: true, ...quiet })).rejects.toThrow()
  await expect(initTable({ cwd, path: 'src/linked/table', skipInstall: true, ...quiet })).rejects.toThrow('symlink')
  expect(await readdir(outside)).toEqual(['package.json', 'src'])
})

test('an install failure leaves the planned source and CSS unwritten', async () => {
  const cwd = await project()
  await expect(initTable({ cwd, install: async () => { throw new Error('offline') }, ...quiet })).rejects.toThrow('offline')
  expect(await readdir(path.join(cwd, 'src'))).toEqual(['style.css'])
  expect(await readFile(path.join(cwd, 'src/style.css'), 'utf8')).not.toContain('components/table')
})

test('large text files truncate without overflowing the argument stack, and retain true totals', () => {
  const sheet = parseTextDocument('name,value\n' + 'a,b\n'.repeat(180000), 'large')
  expect(sheet.rows).toHaveLength(5000)
  expect(sheet.totalRows).toBe(180000)
  expect(sheet.truncated).toBe(true)
  expect(parseMarkdownTable('| name |\n| --- |')).toEqual([['name']])
})

test('JSON sheets preserve first-seen keys, own values, and truncation totals', () => {
  const sheet = jsonSheetDocument([
    { name: 'Ada', active: false, count: 0 },
    { name: 'Ben', details: { role: 'editor' }, tags: ['a', 'b'] },
  ], 'People').sheets[0]!
  expect(sheet.name).toBe('People')
  expect(sheet.columns).toEqual(['name', 'active', 'count', 'details', 'tags'])
  expect(sheet.rows).toEqual([
    ['Ada', 'false', '0', '', ''],
    ['Ben', '', '', '{"role":"editor"}', '["a","b"]'],
  ])
  const large = jsonSheetDocument(Array.from({ length: 5001 }, () => ({ value: 'a' }))).sheets[0]!
  expect(large.rows).toHaveLength(5000)
  expect(large.totalRows).toBe(5001)
  expect(large.truncated).toBe(true)
  const keys = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`key-${index}`, index]))
  expect(jsonSheetDocument([keys]).sheets[0]!.columns).toHaveLength(500)
  expect(jsonSheetDocument([]).sheets[0]!.rows).toEqual([])
})

test('the reference table ships with all of its relative imports and CSS assets', () => {
  expect(tableAssets.files['new-data-table.btsx']).toContain('cellEditing={cellEditing}')
  expect(tableAssets.files['new-data-table.btsx']).toContain("from './sheet-filters.btsx'")
  expect(tableAssets.files['lib/icons/icons.ts']).toContain('undo:')
  for (const [filename, content] of Object.entries(tableAssets.files)) {
    expect(filename).not.toEndWith('.test.ts')
    const references = [
      ...content.matchAll(/(?:from\s*|import\s*\(?)["'](\.[^"']+)["']/g),
      ...content.matchAll(/url\(["']?(\.[^"')]+)["']?\)/g),
    ]
    for (const [, reference] of references) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), reference!))
      expect([target, `${target}.ts`, `${target}.btsx`, `${target}/index.ts`].some(candidate => candidate in tableAssets.files)).toBe(true)
    }
  }
})

test('embedded table assets match the canonical source', async () => {
  const process = Bun.spawn(['bun', 'scripts/build-cli-table-assets.ts', '--check'], { stdout: 'pipe', stderr: 'pipe' })
  expect(await process.exited).toBe(0)
})


test('add table invokes the standalone setup without a registry config', async () => {
  const cwd = await project()
  const child = Bun.spawn(['bun', 'packages/cli/src/index.ts', 'add', 'table', '--cwd', cwd, '--dry-run'], { stdout: 'pipe', stderr: 'pipe' })
  const output = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  expect(output).toContain('Table setup')
  expect(await readdir(cwd)).toEqual(['package.json', 'src'])
})


test('every shipped BTSX component compiles with Beast and Octane validation', () => {
  for (const [filename, content] of Object.entries(tableAssets.files)) {
    if (filename.endsWith('.btsx')) expect(() => compileBeast(content, { filename })).not.toThrow()
  }
})
