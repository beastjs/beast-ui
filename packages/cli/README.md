# @beast-ui/cli

Copy [Beast UI](https://github.com/beastjs/beast-ui) components into a Beast +
Octane project. Components are not a runtime dependency: the CLI writes their
source into your app, where you own and edit it.

Requires Node 22.22.2 or newer.

```bash
npx @beast-ui/cli init --registry <registry-url>
npx @beast-ui/cli list
npx @beast-ui/cli add button --dry-run
npx @beast-ui/cli add button
```

`init` writes `beast-ui.json` to an existing project. `add` resolves registry
dependencies, plans every file before writing, and refuses to replace edited
files without `--overwrite`.

| Command or option | Behavior |
| --- | --- |
| `init --registry <url>` | Create `beast-ui.json`; the URL points at the directory holding the registry JSON. |
| `list` | Show the items in the configured registry. |
| `add <items...>` | Copy items and their registry dependencies, then install their npm dependencies. |
| `-c, --cwd <path>` | Target project directory; defaults to the current directory. |
| `-r, --registry <url>` | Override the configured registry for one `list` or `add`. |
| `add --dry-run` | Show the planned changes without writing or installing. |
| `add --overwrite` | Replace existing files that differ from the registry. |
| `add --skip-install` | Copy source only and print the npm dependencies to install. |

See the [project README](https://github.com/beastjs/beast-ui#consuming-the-registry)
for project requirements and configuration.
