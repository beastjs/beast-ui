# Changelog

All notable changes to `beast-ui` will be recorded here.

## [Unreleased]

### Added

- `button-ripple` and `button-bouncy`, the first variants: separate items that
  build on `button`, marked with `meta.variantOf`. `button-bouncy` depends on
  `@octanejs/motion`. The registry build validates variants, `list` groups them
  under their base, and the showcase nests them in the sidebar and links base
  and variant pages.
- `apps/web`: a component showcase built from the beastjs/dashboard template
  (Rsbuild, TanStack Router, resizable sidebar). Each registry component gets a
  page with a live preview, install command, and dependencies, all driven by
  `registry.json`.
  It deploys to its own Cloudflare Worker, `beast-ui-web`, with client-side
  routes served on reload.
- MIT license.
- `apps/registry`: a Cloudflare Worker that serves the built registry, with
  CORS and revalidation headers. Cloudflare Workers Builds deploys it from
  `main` and uploads preview versions for other branches. `wrangler deploy` builds the registry
  first, so a deploy from a fresh checkout never ships an empty registry.
- The CLI defaults to the hosted registry at
  `https://beast-ui-registry.beastjs.workers.dev/r`: `init` no longer requires
  `--registry`, and `list` works without a config.
- Registry build (`scripts/build-registry.ts`) that validates the catalog and
  publishes per-item payloads to `apps/registry/public/r/`.
- `beast-ui` CLI with `init`, `list`, and `add`.
- `button`, `utils`, and `theme` registry items.
- Docs site with live component previews and links to the published JSON.
- CI workflow running typecheck, tests, and the build on push and pull request.
- `@beastjs/cli` 0.1.0, published from `cli-v*` tags by
  `.github/workflows/publish-cli.yml` with npm provenance. It ships a single
  bundled file with no runtime dependencies, a package README, and repository
  metadata. A test packs the CLI, installs the tarball with npm, and runs
  `init` and `add` under Node.

### Changed

- `@beastjs/cli` 0.3.0 redesigns its output: a file plan marking each file as
  created, replaced, or kept, npm dependencies one per line with their ranges,
  a spinner while packages install (their output appears only on failure), and
  a closing success note. Colors turn off in pipes, in CI, and with `NO_COLOR`.
- `add` offers to create `beast-ui.json` when it is missing, or does so without
  asking with `--yes`. Without a terminal to ask, it stops with that hint.
- `add` keeps an existing file that already contains the code being added,
  ignoring quotes, semicolons, and whitespace, and continues with the install.
- `@beastjs/cli` 0.2.0 ignores registry fields it does not recognize, so a newer
  registry cannot break an older CLI. 0.1.0 validated registry payloads
  strictly and rejects the `meta` field that variants add.
- Octane 0.4.3 and beast-tsrx 0.3.2 across the workspace, with
  `@octanejs/base-ui` 0.1.55 and `@octanejs/motion` 0.1.54 for the registry
  components. Installed components now target Octane 0.4.
- `bun run dev` starts the showcase; the previous docs site runs with
  `bun run docs:dev`, and the local registry with `bun run registry:dev`.
- The registry now builds to `apps/registry/public/r/`. The docs dev server and
  build still serve it at `/r`, and return 404 for unknown items instead of the
  page fallback.
- `beast-ui --version` reports the package version.
- `add` names unknown items and suggests `list` instead of reporting a bare 404,
  and reports unreachable registries and missing package managers plainly.

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
  does not exist in the consuming project. It now imports `@/lib/utils`, and the
  registry build rejects any relative import that leaves its install root.
- Call Chip requires `@hugeicons/core-free-icons@^4.3.5`. Version 4.3.4 imports
  icon files by the wrong letter case, which breaks builds on case-sensitive
  file systems such as Linux.
- CI passes again: removed an unused highlight.js module from the docs, and the
  motion component and docs page tests now render in a DOM instead of through SSR.

### Known limitations

- Scrub Field and Squishy Switch render on the client only. `@octanejs/motion`
  uses an Octane context API that Octane's server runtime does not provide.
