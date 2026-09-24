# Changelog

All notable changes to `beast-ui` will be recorded here.

## [Unreleased]

### Added

- Registry build (`scripts/build-registry.ts`) that validates the catalog and
  publishes per-item payloads to `apps/docs/public/r/`.
- `beast-ui` CLI with `init`, `list`, and `add`.
- `button`, `utils`, and `theme` registry items.
- Docs site with live component previews and links to the published JSON.
- CI workflow running typecheck, tests, and the build on push and pull request.

### Fixed

- Scrub Field and Squishy Switch now declare their props and defaults, use the
  supported Octane Motion APIs, and ship through the registry with their motion
  dependency and live docs previews.
- Squishy Switch now uses native disabled behavior, visible keyboard focus, and
  tracks drags from the initial press. Scrub Field clamps its initial value and
  rejects invalid numeric input.
- Button now evaluates state-based `className` callbacks and merges their result
  with variant classes.
- Docs setup commands retain their line breaks, and wildcard alias instructions
  render in full.
- The installer preserves nested paths beneath documented registry source roots,
  keeping relative imports and same-named files in separate directories intact.

- `button.btsx` imported the class helper by relative path, so the installer's
  alias rewrite never applied and the installed file pointed at a directory that
  does not exist in the consuming project. It now imports `@/lib/utils`.
