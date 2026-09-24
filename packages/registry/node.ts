import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { relativePathSchema } from './schema.ts'

export async function safePath(root: string, relative: string): Promise<string> {
  relativePathSchema.parse(relative)
  let current = await realpath(root)
  for (const segment of relative.split('/')) {
    current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlink path: ${relative}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return current
}

export async function readOptional(file: string): Promise<string | undefined> {
  const { readFile } = await import('node:fs/promises')
  try { return await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
