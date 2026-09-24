# @beast-ui/icons

The icons the web and docs apps draw. Each icon is one file in `svg/`.
`bun run icons:build` turns them into `src/icons.ts`, which `Icon` reads.

## Drawing an icon

```
import { Icon } from '@beast-ui/icons'

Icon(name="search" className="size-4")
```

| Prop | Default | Notes |
| --- | --- | --- |
| `name` | required | a file name from `svg/`, without `.svg` |
| `size` | `20` | width and height in pixels. A class such as `size-4` overrides it. |
| `className` | none | classes for the `<svg>` |
| `color` | the text color | any CSS color. A class such as `text-muted-foreground` works too. |
| `label` | none | names an icon that means something on its own. Without it the icon is hidden from screen readers. |

`Icon` renders a single `<svg>`, with no wrapper and no margin. To make an icon
clickable, put it inside a `button` and give the button an `aria-label`.

## Adding an icon

1. Save it as `svg/<name>.svg`. Names are lowercase words joined by hyphens.
2. Run `bun run icons:build` from the repository root.
3. Commit the `.svg` and `src/icons.ts`.

`bun test` fails when `src/icons.ts` does not match the files in `svg/`.

The build runs each file through [SVGO](https://svgo.dev) and:

- redraws it on a 24×24 grid, so an icon from any set with a square `viewBox`
  works as exported, and stroke widths compare across icons;
- keeps `fill`, `stroke` and similar attributes set on the root `<svg>`, as
  icon sets such as Lucide do;
- turns every color into `currentColor`, so icons are one color and follow the
  text. A lighter part can use `opacity`.
- drops editor leftovers such as `font-size` on shapes and
  `transform-origin="0 0"`;
- prefixes ids with the icon name, so two icons on a page cannot clash.

A comment in the file, such as `<!-- MingCute -->`, records where an icon came
from. Comments are not shipped.

It refuses:

| Message | Fix |
| --- | --- |
| `… is not a valid icon name` | Rename the file: lowercase letters, digits and dashes. |
| `… Icons must be square.` | Export the icon with a square `viewBox`. |
| `… uses transform-origin=…` | Bake the transform into the path in your editor, or re-export it. |
