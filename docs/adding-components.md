# Adding components

Two interactive commands take a finished `.btsx` component to a published
registry item with a showcase page:

| Command | What it does |
| --- | --- |
| `bun run registry:import` | Adds the components in `staging/` to the registry: their source, their `registry.json` entry, any new npm packages, and a showcase entry. |
| `bun run showcase:preview` | Writes a component's showcase preview from its props, and checks the preview before writing it. |

The usual flow is:

1. Drop components into `staging/`.
2. Run `bun run registry:import`, answer its questions, and let it write the
   previews when it offers.
3. Look at the pages with `bun run dev`.
4. Run `bun run check`, then commit.

Both commands run from the repository root, after `bun install`. Both need a
terminal. Pass `--help` to either one for a summary of its questions.

- [Answering prompts](#answering-prompts)
- [Writing a component the tools understand](#writing-a-component-the-tools-understand)
- [Importing components](#importing-components)
- [Writing previews](#writing-previews)
- [Worked example](#worked-example)
- [After the tools](#after-the-tools)
- [Troubleshooting](#troubleshooting)

## Answering prompts

Every question follows the same rules:

```text
  ? Name (badge)                              ← the value in parentheses is the default
  ? Variant of (-) - for none · button, ...   ← dimmed text after it is a hint
```

- **Enter** accepts the default.
- **Lists** are comma- or space-separated: `button, utils` or `button utils`.
- **`-`** means none, for lists and optional text.
- An answer that fails validation is explained and the question is asked again.
  Nothing is written until you confirm at **Write it?**.
- **Ctrl+C** stops at once. Components and previews already written are kept.
  The one you were answering questions about is not written.

## Writing a component the tools understand

The tools read your source, so these conventions decide how much they can fill
in for you.

**Files and names**

- Put one component in each file. The item name comes from the file name:
  `RippleButton.btsx` and `ripple_button.btsx` both become `ripple-button`.
  You can change it at the prompt.
- Beast names a file's component after the file, so `ripple-button.btsx`
  exports `RippleButton`.
- Declare the props at the top level with a type:
  `props { size = "md", label }: MyProps`. Defaults written in the
  destructuring are shown to you by the preview tool.

**Imports**

| Write | Becomes |
| --- | --- |
| `octane`, `octane/*` | nothing to install; every Beast app has it |
| `@/lib/utils` or `../lib/utils` | the `utils` registry dependency; a relative path is rewritten to `@/lib/utils` |
| `./button.btsx`, `./button`, or `@/components/ui/button` | the `button` registry dependency; rewritten to `./button.btsx` |
| any other package, e.g. `@octanejs/motion` | an npm dependency |
| any other relative or `@/` path | cannot be resolved in a user's project; the importer warns and asks before continuing |

Theme color classes such as `bg-primary`, `text-muted-foreground`, or
`border-border` add the `theme` registry dependency. A type-only import of a
package that a registry dependency already installs adds nothing. For example,
`import type { Button } from "@octanejs/base-ui/button"` in a file that depends
on `button` adds no package.

**Props that make better previews**

- **Choices:** use string literal unions, or cva variants with
  `VariantProps<typeof variants>`. Each union can become a row in the preview
  with one example per value.
- **Controlled values:** name them `value`, `checked`, or `open` with an
  `onChange`, or name any value `x` with an `onXChange`. The handler's first
  argument must have the value's type, such as `onChange: (checked: boolean) => void`.
  The preview can then hold the value in state and show it in a status line.
- **Presses:** an `onClick` or `onPress` prop lets the preview count presses.
- **Other:** a `disabled` prop gets a disabled example, and a component that
  takes `children` gets a label.

Props inherited from a library, such as every DOM attribute and event of
`Primitive.Props`, are left out of the list. You can still type them yourself
as example props.

## Importing components

```bash
bun run registry:import              # imports staging/
bun run registry:import path/to/dir  # imports another directory
```

`staging/` is git-ignored and created on first run.

**Order**

The importer only picks up `.btsx` files. Anything else, such as notes, is
listed and left alone. Staged components that import each other are imported
dependencies first, so `card.btsx` comes before a `card-flip.btsx` that
imports it.

**Imports**

For each file it first lists the imports and what each one maps to, including
any rewrite:

```text
  [1/2] button-glow.btsx

  Imports
    › @octanejs/motion  · npm package @octanejs/motion
    › ../lib/utils  · registry item utils → rewritten to @/lib/utils
    › @/components/ui/button  · registry item button → rewritten to ./button.btsx
```

Then it asks:

| Prompt | Default | Answer |
| --- | --- | --- |
| **Name** | from the file name | lowercase words joined by hyphens. An existing component's name asks whether to replace it; replacing updates the item in place. Names of `lib` and `style` items are refused. |
| **Title** | the name in title case | shown in `list` and on the site |
| **Description** | none (required) | one sentence, shown in `list` and on the site |
| **Variant of** | the base, when a file named `<base>-something` imports `<base>` | a base component, or `-`. Variants cannot be based on variants. |
| **Registry dependencies** | the items the imports point to, `theme` when theme colors are used, and the base of a variant | item names. Each must exist or be staged, and a variant must list its base. |
| **npm dependencies** | each package with the range the workspace already uses, else `^<latest>` from npm | `name` or `name@range`, e.g. `clsx@^2.1.1` |
| **Showcase icon** | the base's icon for a variant, else `folder` | one of the listed names, one per file in `packages/icons/svg`. See [Adding an icon](../packages/icons/README.md). |

**The plan**

Before writing, it shows the plan. `+` creates a file, `~` changes one, `=`
keeps one:

```text
  Plan
    + packages/registry/ui/button-glow.btsx
    ~ registry.json (variant of button)
    ~ packages/registry/package.json (adds sonner)
    + apps/web/src/previews/button-glow-preview.btsx (starter preview)
    ~ apps/web/src/previews/index.ts

  ? Write it? (y) y · s to skip · q to quit
```

- **`y`** writes everything and deletes the file from `staging/`. A new
  variant is placed after its base in `registry.json`. `package.json` only
  changes when a package is new to the registry. An existing preview is kept.
- **`s`** leaves the file in `staging/` for another run.
- **`q`** stops. Components written so far are kept.

**Afterwards**

When you finish or quit, the importer runs `bun install` if packages were
added. It then rebuilds and validates the registry, which checks for unknown
dependencies, cycles, bad variants, and broken imports. If that passes, it
offers to write the new components' previews right away, running the preview
tool below. Otherwise the pages show a starter preview, which renders the
component with its description, until you run `bun run showcase:preview`.

## Writing previews

```bash
bun run showcase:preview                  # every missing or starter preview
bun run showcase:preview squishy button   # redo these, asking before replacing hand-written ones
```

A preview lives at `apps/web/src/previews/<name>-preview.btsx` and is
registered in `apps/web/src/previews/index.ts`. The name ends in `-preview`
because Beast names a file's component after the file, and `button.btsx`
would shadow the `Button` it imports.

**Props**

The tool reads the component's props with the TypeScript checker and lists
them, with defaults:

```text
  Props
    › checked?        boolean
    › onChange?       (boolean) => void
    › label?          string
    › disabled?       boolean = false
    › width?          number = 52
```

**Questions**

| Prompt | Shown when | Answer |
| --- | --- | --- |
| **Label** | the component takes children | text inside each example; defaults to the title |
| **Interactive state** | a controlled pair exists | the pair to use, e.g. `checked/onChange`, or `-`. Then it asks the initial value and the status text. A boolean asks for one text per value; others take a template where `{value}` is replaced, e.g. `Opacity: {value}%`. |
| **Count presses with onClick?** | no controlled pair, but `onClick` or `onPress` exists | `y` adds a counter. Then it asks for the text before the first press and the word before the count, e.g. `Pressed` gives "Pressed 3 times." |
| **Show a row with each `<prop>`?** | for each union prop, except the state's | `y`, then the values to show, e.g. only `xs, sm, default, lg` of a button's sizes |
| **`<prop>` (required)** | a required prop has no default | its value; strings are quoted for you |
| **Props for every example** | always | Beast attributes added to every example, e.g. `size="lg" rippleColor="var(--primary)"`, or `-` |
| **Add a disabled example?** | the component has `disabled` | `y` adds one |
| **Another example** | repeats | attributes for one more example, e.g. `hoverScale={1.2} stretch={90}`, then its label. A blank answer finishes. |
| **Note under the preview** | always | a line of help under the preview; defaults to the description; `-` for none |
| **Showcase icon** | the component is not registered in the index yet | as in the importer |

**Output**

The generated file follows the hand-written previews, top to bottom:

1. The interactive example, when there is a controlled state.
2. A row for each union prop, with the counter on each example.
3. A row of the disabled and extra examples.
4. The status line, then the note.

The tool prints the file, then compiles it and typechecks it against the
component:

```text
  ! A problem with this preview:
    › Type '"nope"' is not assignable to type '"default" | "outline" | ... | "link"'.
        near: …<Button variant="nope">Button</Button>…

  ? Write it? (r) y · r to redo · s to skip · q to quit
```

- **`y`** writes the file and registers it.
- **`r`** asks the questions again. It is the default when there are problems.
- **`s`** skips the component.
- **`q`** stops.

Once written, the preview is ordinary source. Edit it by hand as much as you
like. A preview that differs from the starter counts as hand-written, so a
plain `bun run showcase:preview` leaves it alone. Name the component to
regenerate it.

## Worked example

Stage `staging/badge.btsx`:

```text
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

module
  const badgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground",
        accent: "border-transparent bg-primary text-primary-foreground",
        danger: "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  });
  interface BadgeProps extends VariantProps<typeof badgeVariants> { className?: string; children?: unknown; }

props { tone = "neutral", className, children }: BadgeProps
span(className={cn(badgeVariants({ tone }), className)})
  | #{children}
```

Run `bun run registry:import`, then press Enter for every default except these:

```text
  ? Description  A small rounded label for status and counts.
  ? Showcase icon (folder) search
  ? Write it? (y)
  ✓ Added badge · 4 files changed · removed from staging/
  ✓ Rebuilt and validated the registry
  ? Write its preview now? (Y/n)
  ? Label (Badge)
  ? Show a row with each tone? (Y/n)
  ? tones to show (neutral, accent, danger)
  ? Another example
  ? Note under the preview (A small rounded label for status and counts.)
  ✓ Compiles and typechecks against Badge's props
  ? Write it? (y)
```

The importer rewrote `../lib/utils` to `@/lib/utils`. It added `utils` and
`theme` as registry dependencies and `class-variance-authority@^0.7.1` as an
npm dependency. The preview it wrote is:

```text
import Badge from "@beast-ui/registry/ui/badge";

module
  const tones = ["neutral", "accent", "danger"] as const

props {}:{}
div(className="flex flex-col items-center gap-8")
  div(className="flex flex-wrap items-center justify-center gap-4")
    each tone in tones key tone
      Badge(tone={tone}) #{tone}
  p(className="max-w-md text-center text-xs leading-relaxed text-muted-foreground") A small rounded label for status and counts.
```

## After the tools

1. Run `bun run dev` and open `/components/<name>`.
2. Run `bun run check`, which typechecks, tests, and builds. Tests fail if a
   `registry:ui` item has no preview, or if any preview does not compile and
   typecheck. The web typecheck does not read `.btsx` files, so that test is
   what catches them.
3. Commit the files the tools listed:
   - `packages/registry/ui/<name>.btsx`
   - `registry.json`
   - `packages/registry/package.json` and `bun.lock` when packages were added
   - `apps/web/src/previews/<name>-preview.btsx`
   - `apps/web/src/previews/index.ts`

## Troubleshooting

| Message | Cause and fix |
| --- | --- |
| `… is interactive. Run it in a terminal, or pass --help.` | stdin is not a terminal, e.g. in CI or a pipe. Run the command in a terminal. |
| `Nothing to import. Drop .btsx components into staging/ …` | `staging/` has no `.btsx` files. |
| `Cannot resolve <path> in a user's project.` | The import points somewhere the installer cannot reach. Use `@/lib/utils`, a sibling `./<component>.btsx`, or an npm package. Answering `y` imports it anyway. The registry build rejects relative paths that leave the component's folder, such as `../shared/x`. Other paths, such as `@/hooks/x`, build but break in users' projects, so fix them first. |
| `<name> is a registry:lib item. Choose another name.` | That name belongs to a non-UI item. Pick another. |
| `Not in the registry: <names>.` | A registry dependency does not exist and is not staged. Check the spelling, or stage it too. |
| `A variant must depend on its base, <base>.` | Keep the base in **Registry dependencies**. |
| `Use name or name@range: <items>.` | An npm dependency is not a package name. Flags and URLs are not allowed. |
| A package is suggested without a range | npm could not be reached. Type the range yourself, e.g. `sonner@^2.0.0`. |
| `✗ Rebuilt and validated the registry` | The output under it names the problem, such as a cycle or bad import. Fix the source or `registry.json`, then run `bun run registry:build`. The previews step is skipped until the build passes. |
| `Every component has a hand-written preview.` | Nothing is pending. Name a component to redo its preview. |
| `Not a registry:ui item: <names>.` | `showcase:preview` only takes UI items. The message lists the valid names. |
| `Cannot read the props of <name>: it has no default export component. Skipped.` | The file has no top-level component; its markup sits only inside `component` blocks. Give the file a top-level component. A component with no `props` declaration is fine: it gets a preview with no props. |
| A prop is missing from the **Props** list | Props inherited from a library are hidden. Type them as example props; the typecheck still checks their values. |
| A preview problem you cannot place | `near:` quotes the compiled TSX around the error. The attribute in it matches one in the printed file. Answer `r` to redo, or write it and fix the file by hand. |
| `bun run check` fails `every hand-written preview compiles and typechecks` | The failure lists the preview and the problems. It usually means a component's props changed. Update the preview, or regenerate it with `bun run showcase:preview <name>`. |
