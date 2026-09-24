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
`--registry`. `add` resolves registry dependencies, plans every file before
writing, and refuses to replace edited files without `--overwrite`.

| Command or option | Behavior |
| --- | --- |
| `init` | Create `beast-ui.json` for the hosted registry. |
| `init --registry <url>` | Use another registry; the URL points at the directory holding the registry JSON. |
| `list` | Show the items in the configured registry. |
| `add <items...>` | Copy items and their registry dependencies, then install their npm dependencies. |
| `-c, --cwd <path>` | Target project directory; defaults to the current directory. |
| `-r, --registry <url>` | Override the configured registry for one `list` or `add`. Without a config, `list` uses the hosted registry. |
| `add --dry-run` | Show the planned changes without writing or installing. |
| `add --overwrite` | Replace existing files that differ from the registry. |
| `add --skip-install` | Copy source only and print the npm dependencies to install. |

See the [project README](https://github.com/beastjs/beast-ui#consuming-the-registry)
for project requirements and configuration.
