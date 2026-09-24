import { z } from 'zod'

export const itemNameSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase, hyphenated item name').refine((name) => name !== 'registry', 'The name registry is reserved for the catalog')
export const relativePathSchema = z.string().min(1).refine(
  (value) => !value.includes('\\') && !value.includes(':') && !value.includes('\0') &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
  'Expected a relative path without traversal',
)
export const registryUrlSchema = z.url().refine((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
}, 'Expected an HTTP(S) registry directory URL without credentials, query, or fragment')
const itemTypeSchema = z.enum(['registry:ui', 'registry:lib', 'registry:style'])
// Support npm package names with optional semver ranges, never CLI flags or URLs.
const dependencySchema = z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*(?:@[~^<>=0-9a-zA-Z.*|+ -]+)?$/)
const fileShape = {
  path: relativePathSchema,
  type: itemTypeSchema,
  content: z.string().optional(),
}
const itemShape = {
  $schema: z.string().optional(),
  name: itemNameSchema,
  type: itemTypeSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  dependencies: z.array(dependencySchema).default([]),
  registryDependencies: z.array(itemNameSchema).default([]),
}
const registryShape = {
  $schema: z.string().optional(),
  name: itemNameSchema,
  homepage: z.url(),
}
// The catalog source is strict so typos fail the build.
export const registryFileSchema = z.object(fileShape).strict()
export const registryItemSchema = z.object({
  ...itemShape,
  files: z.array(registryFileSchema).min(1),
  // Optional metadata; `variantOf` names the base component a variant builds on.
  meta: z.object({ variantOf: itemNameSchema.optional() }).strict().optional(),
}).strict()
export const registrySchema = z.object({ ...registryShape, items: z.array(registryItemSchema).min(1) }).strict()
// Fetched payloads drop unknown fields instead, so a newer registry never breaks an older CLI.
export const remoteRegistryItemSchema = z.object({
  ...itemShape,
  files: z.array(z.object(fileShape)).min(1),
  meta: z.object({ variantOf: itemNameSchema.optional() }).optional(),
})
export const remoteRegistrySchema = z.object({ ...registryShape, items: z.array(remoteRegistryItemSchema).min(1) })
export const configSchema = z.object({
  registry: registryUrlSchema,
  paths: z.object({ ui: relativePathSchema, lib: relativePathSchema, styles: relativePathSchema }).strict(),
  aliases: z.object({ utils: z.string().regex(/^[@a-zA-Z0-9_~][@a-zA-Z0-9_~./-]*$/) }).strict(),
  packageManager: z.enum(['bun', 'npm', 'pnpm', 'yarn']),
}).strict()
export type RegistryItem = z.infer<typeof registryItemSchema>
export type Registry = z.infer<typeof registrySchema>
export type Config = z.infer<typeof configSchema>
