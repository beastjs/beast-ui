import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { pendingDetails } from '../scripts/preview-gen/pending.ts'
import { pendingPreviews, previewStatus } from '../scripts/preview-gen/session.ts'
import { readRegistry } from '../scripts/registry-import/apply.ts'

const root = fileURLToPath(new URL('../', import.meta.url))

describe('pending previews', () => {
  test('details agree with the session helpers', async () => {
    const registry = await readRegistry(root)
    const details = await pendingDetails(root)
    expect(details.map((item) => item.name).sort()).toEqual((await pendingPreviews(root)).sort())
    for (const item of details) {
      expect(['missing', 'starter']).toContain(item.status)
      const entry = registry.items.find((candidate) => candidate.name === item.name)
      expect(item.title).toBe(entry?.title ?? item.name)
      expect(await previewStatus(root, item.name, entry?.description ?? '')).toBe(item.status)
    }
  })
})
