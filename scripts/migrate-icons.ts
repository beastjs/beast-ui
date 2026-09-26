// One-time move from an older icon map ({ name: { symbol, viewBox, set } }) to the .svg
// files build-icons.ts reads. Run it from the app's folder; see docs/icons.md.
import { mkdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { buildIcon } from './build-icons.ts'

interface LegacyIcon {
  symbol: string
  viewBox?: string
  set?: string
}

export interface MigratedIcon {
  name: string
  file: string
  keepColors: boolean
  /** The old markup and viewBox, for the preview. */
  before: { symbol: string; viewBox: string }
  /** What build-icons.ts makes of the new file. */
  after: string
}

export interface Migration {
  written: MigratedIcon[]
  skipped: { name: string; reason: string }[]
}

// A painted color other than none or currentColor, or a gradient: the icon keeps its colors.
const hardColor = /(?:fill|stroke|stop-color|flood-color|lighting-color)\s*(?:=\s*["']|:\s*)(?!none|currentColor|transparent|inherit)[#a-z(]/i
// 24px art squeezed into a 16px box with a scale(0.667) group, as older maps did.
const squeezed = /^<g transform="scale\(0\.667\)">([\s\S]*)<\/g>$/
const isLegacyIcon = (value: unknown): value is LegacyIcon =>
  typeof value === 'object' && value !== null && typeof (value as LegacyIcon).symbol === 'string'
const exists = (file: string) => stat(file).then(() => true, () => false)

/** Writes one .svg per icon in the maps' exports, into `svg` or `svg/color`. Never overwrites. */
export async function migrateIcons(svg: string, maps: string[]): Promise<Migration> {
  const icons = new Map<string, LegacyIcon & { from: string }>()
  const skipped: Migration['skipped'] = []
  for (const map of maps) {
    const exports: Record<string, unknown> = await import(path.resolve(map))
    for (const [exportName, value] of Object.entries(exports)) {
      if (typeof value !== 'object' || value === null) continue
      const entries = Object.entries(value)
      // An export is a map when at least one entry is an icon, so a typo in one entry is reported.
      if (!entries.some(([, icon]) => isLegacyIcon(icon))) continue
      const from = `${exportName} in ${path.basename(map)}`
      for (const [name, icon] of entries) {
        if (!isLegacyIcon(icon)) {
          skipped.push({ name, reason: `has no symbol string in ${from}. Its keys: ${Object.keys(icon ?? {}).join(', ') || 'none'}.` })
          continue
        }
        const first = icons.get(name)
        if (first) skipped.push({ name, reason: `is in both ${first.from} and ${from}. Rename one, then run again.` })
        else icons.set(name, { ...icon, from })
      }
    }
  }
  const written: MigratedIcon[] = []
  for (const [name, icon] of [...icons].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const before = { symbol: icon.symbol, viewBox: icon.viewBox ?? '0 0 24 24' }
    const unsqueezed = before.viewBox === '0 0 16 16' ? icon.symbol.match(squeezed) : null
    const symbol = unsqueezed ? unsqueezed[1] : icon.symbol
    const viewBox = unsqueezed ? '0 0 24 24' : before.viewBox
    const keepColors = hardColor.test(symbol)
    // Where the icon came from, kept as a comment. `svg` was the old placeholder.
    const set = (icon.set ?? '').replace(/[^a-z0-9.-]+$/i, '')
    const credit = set && set !== 'svg' && set !== name ? `<!-- ${set.replace(/--/g, '-')} -->\n` : ''
    const source = `${credit}<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${symbol}</svg>\n`
    const file = path.join(svg, keepColors ? 'color' : '', `${name}.svg`)
    try {
      const after = buildIcon(name, source, { keepColors })
      if (await exists(file)) throw new Error(`${path.relative(process.cwd(), file)} already exists.`)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, source)
      written.push({ name, file, keepColors, before, after })
    } catch (error) {
      skipped.push({ name, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { written, skipped }
}

/** A page that draws each icon the old way and the new way, and flags the ones that differ. */
export function previewPage(icons: MigratedIcon[]): string {
  const data = icons.map(({ name, keepColors, before, after }) => ({ name, keepColors, before, after }))
  return `<!doctype html>
<meta charset="utf-8">
<title>Icon migration preview</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; color: #111; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 16px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 8px; }
  .card.differs { border-color: #d33; background: #fff4f4; }
  .pair { display: flex; gap: 12px; justify-content: center; padding: 6px 0; }
  .pair img { width: 48px; height: 48px; }
  .name { font: 12px ui-monospace, monospace; word-break: break-all; }
  .meta { color: #666; font-size: 12px; }
</style>
<h1>Icon migration preview</h1>
<p>Each card shows the icon as the old component drew it (left) and as the new <code>Icon</code> draws it (right).
Red cards differ in more than 1% of their pixels, and come first. <b>color</b> marks icons that keep their colors.</p>
<label><input type="checkbox" id="only"> Only show icons that differ</label>
<p id="summary" class="meta">Comparing…</p>
<div class="grid" id="grid"></div>
<script type="module">
  const icons = ${JSON.stringify(data).replace(/</g, '\\u003c')}
  const SIZE = 96
  // A square width and height, as <Icon> renders, so a wide old viewBox is centered, not stretched.
  const svg = (viewBox, attributes, body) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE + '" style="color:#111" viewBox="' + viewBox + '" ' + attributes + '>' + body + '</svg>'
  const old = (icon) => svg(icon.before.viewBox, 'fill="currentColor" stroke="none" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"', icon.before.symbol)
  const next = (icon) => svg('0 0 24 24', 'fill="currentColor" stroke-linecap="round" stroke-linejoin="round"', icon.after)
  const still = (markup) => markup.replace(/<animate\\w*\\b[\\s\\S]*?(\\/>|<\\/animate\\w*>)/g, '')
  const url = (markup) => URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  async function pixels(markup) {
    const image = new Image()
    image.src = url(still(markup))
    await image.decode()
    const canvas = new OffscreenCanvas(SIZE, SIZE)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, SIZE, SIZE)
    return context.getImageData(0, 0, SIZE, SIZE).data
  }
  async function difference(icon) {
    const [a, b] = await Promise.all([pixels(old(icon)), pixels(next(icon))])
    let ink = 0, differ = 0
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] || b[i + 3]) ink++
      // Anti-aliasing moves an edge pixel by less than half; a changed shape moves it all the way.
      if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3])) > 128) differ++
    }
    return ink ? differ / ink : 0
  }
  const results = []
  for (const icon of icons) results.push({ icon, score: await difference(icon).catch(() => 1) })
  results.sort((a, b) => b.score - a.score || (a.icon.name < b.icon.name ? -1 : 1))
  const grid = document.getElementById('grid')
  for (const { icon, score } of results) {
    const card = document.createElement('div')
    card.className = 'card' + (score > 0.01 ? ' differs' : '')
    card.innerHTML = '<div class="pair"><img alt="before"><img alt="after"></div><div class="name"></div><div class="meta"></div>'
    const [before, after] = card.querySelectorAll('img')
    before.src = url(old(icon))
    after.src = url(next(icon))
    card.querySelector('.name').textContent = icon.name
    card.querySelector('.meta').textContent = (score * 100).toFixed(1) + '% differ' + (icon.keepColors ? ' · color' : '')
    grid.append(card)
  }
  const differing = results.filter((result) => result.score > 0.01).length
  document.getElementById('summary').textContent = results.length + ' icons, ' + differing + ' differ.'
  document.getElementById('only').addEventListener('change', (event) => grid.classList.toggle('only', event.target.checked))
  document.head.insertAdjacentHTML('beforeend', '<style>.grid.only .card:not(.differs) { display: none; }</style>')
</script>
`
}

const usage = `Moves an app's icon maps to .svg files for build-icons.ts. See docs/icons.md in beast-ui.

  bun <beast-ui>/scripts/migrate-icons.ts --svg <folder> <map.ts> [<map.ts> …] [--preview <file>]

  --svg <folder>    where to write the .svg files. Icons with their own colors go in <folder>/color.
  <map.ts>          modules that export { name: { symbol, viewBox } } maps, such as icons.ts and logos.ts
  --preview <file>  the comparison page to write (default: icons-preview.html in the temp folder)`

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { svg: { type: 'string' }, preview: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
  })
  if (values.help || !values.svg || !positionals.length) {
    console.log(usage)
    process.exit(values.help ? 0 : 1)
  }
  const svg = path.resolve(values.svg)
  const { written, skipped } = await migrateIcons(svg, positionals)
  const colored = written.filter((icon) => icon.keepColors).length
  const shown = path.relative(process.cwd(), svg)
  console.log(`Wrote ${written.length} icons: ${written.length - colored} to ${shown}, ${colored} to ${shown}/color (they keep their colors).`)
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`)
    for (const { name, reason } of skipped) console.log(`  ${name}: ${reason}`)
  }
  if (written.length) {
    const preview = path.resolve(values.preview ?? path.join(os.tmpdir(), 'icons-preview.html'))
    await writeFile(preview, previewPage(written))
    console.log(`\nCompare before and after: open ${preview}`)
  }
  if (skipped.length) process.exit(1)
}
