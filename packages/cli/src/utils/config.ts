import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { configSchema, type Config } from '@beast-ui/registry/schema'
import { safePath, readOptional } from '@beast-ui/registry/node'

export const DEFAULT_REGISTRY = 'https://beast-ui-registry.beastjs.workers.dev/r'

export async function findConfig(cwd: string): Promise<Config | undefined> {
  const contents = await readOptional(await safePath(cwd, 'beast-ui.json'))
  return contents === undefined ? undefined : configSchema.parse(JSON.parse(contents))
}

export async function readConfig(cwd: string): Promise<Config> {
  const config = await findConfig(cwd)
  if (config === undefined) throw new Error('Missing beast-ui.json. Run init first.')
  return config
}

export async function initConfig(cwd: string, registry: string = DEFAULT_REGISTRY, manager?: Config['packageManager']) {
  if (await readOptional(path.join(cwd, 'package.json')) === undefined) throw new Error('Run init inside an existing Beast project with a package.json.')
  let packageManager = manager ?? 'npm'
  if (!manager) {
    for (const [file, name] of [['bun.lock', 'bun'], ['bun.lockb', 'bun'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn']] as const) {
      if (await readOptional(path.join(cwd, file)) !== undefined) { packageManager = name; break }
    }
  }
  const config = configSchema.parse({
    registry,
    paths: { ui: 'src/components/ui', lib: 'src/lib', styles: 'src/styles' },
    aliases: { utils: '@/lib/utils' },
    packageManager,
  })
  const file = await safePath(cwd, 'beast-ui.json')
  await writeFile(file, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
  return config
}
