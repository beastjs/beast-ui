# beast-ui

A source-distribution component registry for [Beast](https://www.npmjs.com/package/beast-tsrx)
and [Octane](https://octanejs.dev/), in the shape of a shadcn-compatible registry.
Components are not installed as a runtime dependency — the CLI copies the source
into your project, where you own and edit it.

```bash
bun install
bun run dev      # builds the registry, serves the docs at http://127.0.0.1:5173
bun run check    # typecheck + test + build
```

## Layout

| Path | Purpose |
| --- | --- |
| `registry.json` | The catalog: one entry per item, with its files, npm dependencies, and registry dependencies. |
| `packages/registry/` | The component sources themselves (`ui/`, `lib/`, `styles/`) plus the shared Zod schema and path helpers. |
| `packages/cli/` | The `beast-ui` CLI: `init`, `list`, `add`. |
| `apps/docs/` | The docs site, which also serves the built registry at `/r/*.json`. |
| `scripts/build-registry.ts` | Compiles `registry.json` into `apps/docs/public/r/` payloads. |
| `tests/registry.test.ts` | End-to-end coverage of the build, the resolver, and the installer. |

## Adding a component to the registry

1. Write the source under `packages/registry/ui/`, `lib/`, or `styles/`. UI files
   are `.btsx`, lib files are `.ts`, style files are `.css` — the installer
   rejects any other extension for a given type.
2. Import the class helper as `@/lib/utils`. That exact specifier is what the
   installer rewrites to the consuming project's configured `aliases.utils`, so
   a relative import would silently ship a broken path.
3. Add an entry to `registry.json` with its `dependencies` (npm) and
   `registryDependencies` (other items). The build fails on unknown names,
   duplicate names, or dependency cycles.
4. Run `bun run check`.

The installer strips `packages/registry/ui/`, `packages/registry/lib/`, or
`packages/registry/styles/` from each file's path according to its type. The short
roots `ui/`, `lib/`, and `styles/` are also supported. Everything beneath that
root is preserved: `packages/registry/lib/internal/value.ts` installs to
`<paths.lib>/internal/value.ts`. Paths without one of these prefixes are already
relative to the configured destination. Use relative imports within a type's
directory tree; use configured aliases when importing across destination roots.

## Consuming the registry

Run these commands from the **beast-ui repository root**. The target must already
be a Beast + Octane app with a `package.json`; `init` does not scaffold an app.
The CLI is currently private and runs from this checkout.

Start the registry in one terminal:

```bash
bun install
bun run dev
```

In a second terminal, also at the beast-ui repository root, initialize and install
into your app (replace `../my-app` with its relative or absolute path):

```bash
bun run cli init --cwd ../my-app --registry http://127.0.0.1:5173/r
bun run cli list --cwd ../my-app
bun run cli add button --cwd ../my-app --dry-run
bun run cli add button --cwd ../my-app
```

`init` writes `beast-ui.json` (registry URL, destination paths, utils alias,
package manager, detected from the lockfile). `add` resolves the full dependency
closure, plans every file before writing any of them, and refuses to clobber a
modified file without `--overwrite`.

The consuming project needs Tailwind CSS v4, a `@/*` alias resolving to `src/*`
in both TypeScript and the bundler, and `src/styles/theme.css` imported after
`@import "tailwindcss"`.

For example, in `src/style.css`:

```css
@import "tailwindcss";
@import "./styles/theme.css";
```

Then use the installed component in a `.btsx` file:

```text
import Button from '@/components/ui/button.btsx'

Button(variant='outline' onClick={() => console.log('Clicked')}) Click me
```

### Configuration

`init` creates `beast-ui.json` in the target project. Review it before adding
components if your project uses different directories or aliases:

```json
{
  "registry": "http://127.0.0.1:5173/r",
  "paths": {
    "ui": "src/components/ui",
    "lib": "src/lib",
    "styles": "src/styles"
  },
  "aliases": { "utils": "@/lib/utils" },
  "packageManager": "bun"
}
```

Paths are relative to the target project. `aliases.utils` must resolve to the
installed utility file through your TypeScript and bundler configuration. The
CLI rewrites that import but does not configure either tool for you.

The package manager is detected from Bun, pnpm, or Yarn lockfiles, falling back
to npm. Override detection during initialization with
`--package-manager bun|npm|pnpm|yarn`. An existing config is never overwritten;
edit it directly to change settings.

### Commands and options

| Command or option | Behavior |
| --- | --- |
| `init --registry <url>` | Create configuration; registry URL must point to the directory containing the JSON items. |
| `list` | Show available items from the configured registry. |
| `list --registry <url>` | List items without needing a config. |
| `add <items...>` | Copy one or more items and their registry dependencies; install their npm dependencies. |
| `-c, --cwd <path>` | Select the target project; defaults to the current directory. |
| `-r, --registry <url>` | Required for `init`; overrides the URL for a single `list` or `add` invocation. |
| `add --dry-run` | Fetch and validate items, then show changes without writing files or installing packages. |
| `add --overwrite` | Allow replacement of differing existing source files. |
| `add --skip-install` | Copy source only; print the npm dependencies to install yourself. |
| `--help` | Show help; also available for each command. |

Examples:

```bash
# Browse a registry before initializing an app
bun run cli list --registry http://127.0.0.1:5173/r

# Add several items (shared dependencies are resolved once)
bun run cli add utils theme --cwd ../my-app

# Preview an update that would replace edited source files
bun run cli add button --cwd ../my-app --overwrite --dry-run

# Apply that update
bun run cli add button --cwd ../my-app --overwrite

# Copy sources and handle npm dependencies separately
bun run cli add button --cwd ../my-app --skip-install

bun run cli add --help
```

Adding `button` also installs `utils` and `theme`. Identical source files are
left in place; differing files stop the operation unless `--overwrite` is set.
Package installation still runs on repeated adds unless `--skip-install` is set.

If you prefer Node, build the CLI with `bun run --cwd packages/cli build`, then
run `node /absolute/path/to/beast-ui/packages/cli/dist/index.js --help` from
any directory. Node 22.22.2 or newer is required.

## Safety properties

These are enforced by the schema and the path helpers, and covered by tests:

- Registry item names are lowercase and hyphenated; `registry` is reserved.
- File paths are relative, with no traversal, drive letters, or backslashes.
- Destinations are resolved segment by segment and refuse to follow symlinks.
- Registry URLs must be HTTP(S) with no credentials, query, or fragment.
- npm dependency strings must look like package names with optional semver
  ranges — never flags or URLs, which are passed to the package manager.
- A failed catalog build leaves the previously published output untouched.

Record changes in [CHANGELOG.md](CHANGELOG.md).
