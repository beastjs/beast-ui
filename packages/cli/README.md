# @beastjs/cli

Copy [Beast UI](https://github.com/beastjs/beast-ui) components into a Beast +
Octane project. Components are not a runtime dependency: the CLI writes their
source into your app, where you own and edit it.

Requires Node 22.22.2 or newer.

```bash
npx @beastjs/cli init
npx @beastjs/cli list
npx @beastjs/cli add button --dry-run
npx @beastjs/cli add button
```

`init` writes `beast-ui.json` to an existing project, using the hosted registry
at `https://beast-ui-registry.beastjs.workers.dev/r` unless you pass
`--registry`. Without that file, `add` offers to create it first; pass `--yes`
to skip the question, as CI and scripts must.

`add` resolves registry dependencies and shows every file and npm dependency
before it changes anything. A file that already contains the code being added
(ignoring quotes, semicolons, and whitespace) is kept as it is, and the install
continues. A file with different code stops the command unless you pass
`--overwrite`.

| Command or option | Behavior |
| --- | --- |
| `init` | Create `beast-ui.json` for the hosted registry. |
| `init --registry <url>` | Use another registry; the URL points at the directory holding the registry JSON. |
| `list` | Show the items in the configured registry. |
| `add <items...>` | Copy items and their registry dependencies, then install their npm dependencies. |
| `-c, --cwd <path>` | Target project directory; defaults to the current directory. |
| `-r, --registry <url>` | Override the configured registry for one `list` or `add`. Without a config, `list` uses the hosted registry. |
| `add -y, --yes` | Create `beast-ui.json` without asking when it is missing. |
| `add --dry-run` | Show the planned changes without writing or installing. |
| `add --overwrite` | Replace existing files that differ from the registry. |
| `add --skip-install` | Copy source only and print the npm dependencies to install. |

See the [project README](https://github.com/beastjs/beast-ui#consuming-the-registry)
for project requirements and configuration.

## Icons

```bash
bunx @beastjs/cli icons init --dry-run
bunx @beastjs/cli icons init
bunx @beastjs/cli icons init --framework react
```

Requires Bun and an existing project. Creates four starter SVGs, a typed icon
map, the selected framework's `Icon` component, and `scripts/build-icons.ts`.
Installs SVGO as a dev dependency, adds `icons:build` and `icons:check`, and runs
the first build. No `beast-ui.json` is needed. Use `--cwd <path>` for another
project. Existing files and script commands are preserved; conflicts stop the
setup before any changes. `--dry-run` shows the complete setup and conflicts.

Import `{ Icon }` from `@/lib/icons` (requires the project's `@/*` alias to
`src/*`). Save new SVGs in `src/lib/icons/svg/`, run `bun run icons:build`, and
commit the SVGs with `icons.ts`. Put colored art in `svg/color/`. Use
`bun run icons:check` in CI. The React template uses `useId` and includes
`'use client'` for Next.js compatibility.

## Table

```bash
bunx @beastjs/cli@0.3.2 table init
bunx @beastjs/cli@0.3.2 table init --dry-run
# Equivalent shortcut, installed separately from registry components:
bunx @beastjs/cli@0.3.2 add table
```

Requires an existing Beast + Octane project and Tailwind CSS v4. Copies the
standalone spreadsheet viewer, table controls, local parser, 30 typed icons,
and its namespaced palette into `src/components/table`. Imports the styles
into the Tailwind entry and installs compatible adapters without replacing
Octane. No aliases, shared UI, or `beast-ui.json` are needed. Different existing
files stop setup before installation or writes; unchanged files are kept.

Render from `src/App.btsx`:

```btsx
import Table from './components/table/table.btsx'

Table
```

Use `--cwd` for another project, `--path` to choose a source directory,
`--css` to select the Tailwind entry, `--package-manager` to override lockfile
detection, or `--skip-install` to defer npm dependencies. Octane 0.2.x,
0.3.x, 0.4.x, and 0.8.x have pinned adapter profiles. See the
[table guide](https://github.com/beastjs/beast-ui/blob/main/docs/table.md)
for file formats, URL behavior, limits, and maintenance.
