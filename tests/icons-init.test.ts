import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { initIcons } from '../packages/cli/src/commands/icons.ts'
import { buildIcons } from '../scripts/build-icons.ts'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function project(manifest: { name: string; scripts: Record<string, string> } = { name: 'example', scripts: { dev: 'vite' } }) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'icons-init-'))
  dirs.push(cwd)
  await writeFile(path.join(cwd, 'package.json'), JSON.stringify(manifest))
  return cwd
}

for (const framework of ['beast', 'react'] as const) {
  test(`sets up ${framework}, preserves project settings, runs install and build, and can rerun`, async () => {
    const cwd = await project()
    const calls: string[][] = []
    const run = async (command: string, args: string[], directory: string) => {
      expect(directory).toBe(cwd)
      calls.push([command, ...args])
      if (args[0] === 'run') {
        const output = path.join(cwd, 'src/lib/icons/icons.ts')
        await writeFile(output, await buildIcons(path.join(cwd, 'src/lib/icons/svg'), output))
      }
    }
    const files = await initIcons({ cwd, framework, run, log: () => {} })
    expect(files.every(file => file.status === 'create')).toBe(true)
    expect(calls).toEqual([['bun', '--version'], ['bun', 'add', '--dev', 'svgo@^4.1.0'], ['bun', 'run', 'icons:build']])
    const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'))
    expect(manifest.name).toBe('example')
    expect(manifest.scripts.dev).toBe('vite')
    expect(manifest.scripts['icons:check']).toEndWith('--check')
    expect(await readdir(path.join(cwd, 'src/lib/icons/svg/color'))).toEqual([])
    expect(await readFile(path.join(cwd, `src/lib/icons/Icon.${framework === 'beast' ? 'btsx' : 'tsx'}`), 'utf8')).toContain('useId')
    const again = await initIcons({ cwd, framework, run, log: () => {} })
    expect(again.every(file => file.status === 'keep')).toBe(true)
  })
}

test('dry run describes the complete setup without writing or spawning', async () => {
  const cwd = await project()
  const before = await readFile(path.join(cwd, 'package.json'), 'utf8')
  const lines: string[] = []
  const files = await initIcons({ cwd, dryRun: true, log: line => lines.push(line), run: async () => { throw new Error('must not run') } })
  expect(files).toHaveLength(9)
  expect(lines.join('\n')).toContain('directory: src/lib/icons/svg/color/')
  expect(lines.join('\n')).toContain('script: icons:check')
  expect(lines.join('\n')).toContain('run: bun add --dev svgo@^4.1.0')
  expect(lines.join('\n')).toContain('run: bun run icons:build')
  expect(await readdir(cwd)).toEqual(['package.json'])
  expect(await readFile(path.join(cwd, 'package.json'), 'utf8')).toBe(before)
})

test('reports all file and script conflicts before any writes or installs', async () => {
  const cwd = await project({ name: 'example', scripts: { dev: 'vite', 'icons:build': 'custom' } })
  await mkdir(path.join(cwd, 'src/lib/icons/svg'), { recursive: true })
  await writeFile(path.join(cwd, 'src/lib/icons/svg/search.svg'), 'custom search')
  await writeFile(path.join(cwd, 'src/lib/icons/icons.ts'), 'custom generated output')
  const lines: string[] = []
  const options = { cwd, log: (line: string) => lines.push(line), run: async () => { throw new Error('must not run') } }
  await expect(initIcons(options)).rejects.toThrow('No files were changed')
  expect(lines.join('\n')).toContain('package.json scripts.icons:build')
  expect(lines.join('\n')).toContain('conflict: src/lib/icons/svg/search.svg')
  expect(lines.join('\n')).toContain('conflict: src/lib/icons/icons.ts')
  expect(await readdir(cwd)).toEqual(['package.json', 'src'])
  expect(await readFile(path.join(cwd, 'src/lib/icons/svg/search.svg'), 'utf8')).toBe('custom search')
  await initIcons({ ...options, dryRun: true })
})

test('refuses symlinks and missing project manifests', async () => {
  const cwd = await project()
  const { symlink } = await import('node:fs/promises')
  await symlink(os.tmpdir(), path.join(cwd, 'scripts'))
  await expect(initIcons({ cwd, dryRun: true, log: () => {} })).rejects.toThrow('symlink')
  await rm(path.join(cwd, 'package.json'))
  await expect(initIcons({ cwd, dryRun: true, log: () => {} })).rejects.toThrow('missing package.json')
})

test('embedded CLI assets match their canonical sources', async () => {
  const result = Bun.spawn(['bun', 'scripts/build-cli-icon-assets.ts', '--check'], { stdout: 'pipe', stderr: 'pipe' })
  expect(await result.exited).toBe(0)
})
