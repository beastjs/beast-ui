# Table

Install the spreadsheet viewer into an existing Beast + Octane project with Tailwind CSS v4:

```bash
bunx @beastjs/cli@0.3.2 table init
# Equivalent shortcut: bunx @beastjs/cli@0.3.2 add table
```

The CLI copies the complete feature into `src/components/table`, installs its npm dependencies with the project's package manager, and imports `table.css` into the Tailwind entry stylesheet. It includes the sheet panel, DataTable and its controls, worksheet selector, parser, 30 typed icons, and URL-state adapter. Source imports are relative, so no `@/` alias or `beast-ui.json` is required. The bundle is embedded in the CLI; it does not need the hosted component registry.

Render it from `src/App.btsx`:

```btsx
import Table from './components/table/table.btsx'

Table
```

The installer supports Octane 0.2.x, 0.3.x, 0.4.x, and 0.8.x. It selects pinned adapter releases with compatible peers and preserves the existing Octane runtime. Node 22.22.2 or newer is required by the CLI and bindings. The nuqs source uses `Promise.withResolvers`, so typechecking should include `ES2024` and Node types, as in the Beast templates. Configure the Beast bundler plugin before using this feature.

## Options

```bash
bunx @beastjs/cli@0.3.2 table init --dry-run
bunx @beastjs/cli@0.3.2 table init --cwd ../my-app --css src/index.css
bunx @beastjs/cli@0.3.2 table init --path src/features/table --skip-install
bunx @beastjs/cli@0.3.2 table init --package-manager npm
```

`--css` is project-relative. Without it, the installer looks for one common stylesheet containing `@import "tailwindcss"`. If it finds zero or multiple candidates, it asks you to select one through `--css`. It checks every destination before installing packages or writing source. Different existing files are reported as conflicts and preserved. Repeating an unchanged install keeps the source and avoids adding duplicate CSS imports. With `--skip-install`, install the dependencies printed by the CLI before building.

## Behavior

- CSV, TSV, Excel (`xls`, `xlsx`, `xlsm`, `xlsb`, `ods`), Markdown tables, pipe/semicolon-delimited text, and line lists.
- All workbook tabs, with a mobile worksheet selector.
- Search, faceted filters, alphanumeric sorting, pagination, column visibility, pinning, resizing, and drag ordering.
- File parsing in the browser. Google Sheets import downloads a public workbook directly from Google and depends on its sharing, download, and cross-origin permissions. Upload an Excel copy if the browser blocks export.
- A 10 MB input limit, up to 500 displayed columns, and the first 5,000 data rows, with the total and truncation notice retained.
- Table URL keys use `sheet-`. A new dataset or worksheet clears that namespace, including persisted widths. Local file contents are not saved in the URL or persisted after reload. Mount one viewer per route.
- Namespaced `btable` color tokens support light mode and a host `.dark` class. The viewer's icons, UI primitives, and palette are independent of the host project's shared components.

## Extraction review

The original LiveSnaps panel depended on an admin feature configuration, UI barrels, shared icons, shared CSS tokens, and an adapter mounted at the application root. Those dependencies are now contained in the feature. Calendar and drag-order controls remain lazy loaded.

The extraction also fixes stale column widths on replacement, unlabeled clear controls, repeated input IDs, oversized empty-state layout, invalid inline fragment markup, incompatible checkbox callbacks, and several component type errors. Grid normalization no longer spreads an unbounded row array into `Math.max`, and only pads retained rows; large files can truncate without a stack overflow. Header-only Markdown tables retain their column headings.

## Maintaining and releasing

Edit authored sources in `packages/cli/templates/table`, then run:

```bash
bun scripts/build-cli-table-assets.ts
bun test tests/table-init.test.ts
bun run --cwd packages/cli build
```

`packages/cli/src/table-assets.ts` is generated. The build embeds it in `dist/index.js`, so npm publishes the feature together with the command. The package version is prepared as `0.3.2`. The existing publish workflow releases a new version after its package manifest is merged to `main`; preparing source locally does not publish it.
