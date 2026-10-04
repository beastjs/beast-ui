import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [version = 'patch', ...extra] = process.argv.slice(2)
if (extra.length || !/^(patch|minor|major|prepatch|preminor|premajor|prerelease|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.test(version)) {
  console.error('Usage: bun run cli:version [patch|minor|major|prepatch|preminor|premajor|prerelease|<version>]')
  process.exit(1)
}

const root = fileURLToPath(new URL('../', import.meta.url))
const lockPath = join(root, 'bun.lock')
const lock = readFileSync(lockPath, 'utf8')
const cliVersion = /("packages\/cli"\s*:\s*\{[^{}]*?"version"\s*:\s*")[^"]+(")/
if (!cliVersion.test(lock)) {
  console.error('Cannot find the CLI workspace version in bun.lock.')
  process.exit(1)
}

const result = Bun.spawnSync([
  process.execPath, 'pm', '--cwd', 'packages/cli', 'version', version, '--no-git-tag-version',
], { cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
if (result.exitCode !== 0) process.exit(result.exitCode)

const pkg = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8'))
writeFileSync(lockPath, lock.replace(cliVersion, (_, prefix, suffix) => `${prefix}${pkg.version}${suffix}`))
