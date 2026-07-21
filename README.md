# Domo Icons

Converts Domo's two icon fonts into individual, URL-addressable **SVGs** and publishes
them to GitHub Pages so they can be embedded anywhere (`<img>`, CSS `background`, docs,
emails, other apps).

- **`phosphor`** — Domo's current icon set (1070 icons)
- **`domocons`** — the legacy icon set (559 icons)
- **`colored`** — circular colored-background variants of the icons used in Domo's
  approval-form icon picker (40 icons), matching the app's exact colors

## Public URLs

Once deployed (see [Deployment](#deployment)), every icon is a stable URL:

```
https://<owner>.github.io/domo-icons/phosphor/<name>.svg
https://<owner>.github.io/domo-icons/domocons/<name>.svg
https://<owner>.github.io/domo-icons/colored/<name>.svg
```

Examples:

```html
<!-- Monochrome icon (inherits text color via currentColor) -->
<img src="https://<owner>.github.io/domo-icons/phosphor/clock.svg" width="24" alt="clock">

<!-- Recolor with CSS when inlined, or wrap in a colored container -->
<span style="color:#347b26">
  <img src="https://<owner>.github.io/domo-icons/phosphor/clock.svg" width="24">
</span>

<!-- Colored circular badge, exactly as it looks in Domo -->
<img src="https://<owner>.github.io/domo-icons/colored/clock.svg" width="40" alt="clock">
```

Browse everything at `https://<owner>.github.io/domo-icons/` (generated gallery).

## How it works

The icon fonts (`fonts/*.woff`) store glyphs at Private-Use-Area codepoints with **no
names**. `style.css` is the source of truth for names — it maps each class to a codepoint:

```css
.icon-clock:before        { content: "\e734"; }   /* phosphor  -> phosphor/clock.svg  */
.legacy-icon-toolbox:before { content: "\f3cb"; }  /* domocons  -> domocons/toolbox.svg */
```

`yarn build` (`scripts/build.mjs`):

1. Parses `style.css` into `{ name -> codepoint }` maps ([`scripts/parse-css.mjs`](scripts/parse-css.mjs)).
2. Loads each `.woff` with `opentype.js` and extracts each named glyph as an SVG path.
   Every icon in a font shares one square `viewBox` (the union of all glyph bounding
   boxes) so the set stays mutually aligned and consistently sized. Monochrome paths use
   `fill="currentColor"`.
3. Emits colored circular variants for the picker icons, driven by
   [`data/picker-icons.json`](data/picker-icons.json) (white glyph on the icon's Domo
   background color).
4. Writes a gallery `index.html` and a `.nojekyll` marker into `dist/`.

The build is fully offline — no browser or network — so it runs unchanged in CI.

## Develop

```bash
corepack enable          # once, enables Yarn Berry
yarn install
yarn build               # writes dist/
```

Expected output: `1070` files in `dist/phosphor/`, `559` in `dist/domocons/`,
`40` in `dist/colored/`.

## Refreshing picker colors

`data/picker-icons.json` holds the picker's `{ name, bg, fg }` and is committed so the
build never needs a browser. To re-capture it from the live Domo app (e.g. if Domo
changes the icons or colors), use the [`playwriter`](https://playwriter.dev) skill against
your authenticated browser:

```bash
# 1. In your browser, open an approval-form editor and open a template's icon picker
#    so the icon grid is visible:
#    https://<instance>.domo.com/approval/edit-request-form/<id>

# 2. Start a playwriter session (direct CDP on port 9222, or via the extension)
playwriter session new --browser direct:9222

# 3. Run the capture script against that session
playwriter -s <id> -f scripts/capture-picker.js

# 4. Review the diff and commit data/picker-icons.json, then rebuild
yarn build
```

[`scripts/capture-picker.js`](scripts/capture-picker.js) finds the picker container,
clicks "Show More", reads each icon's class + computed background/foreground color, drops
the search-bar controls, and rewrites `data/picker-icons.json`.

## Deployment

Pushing to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml):
`yarn install --immutable` → `yarn build` → upload `dist/` → deploy to GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source = GitHub Actions**.

## Layout

```
fonts/                phosphor.woff, domocons.woff
style.css             name -> codepoint mapping (source of truth for both fonts)
data/picker-icons.json  captured picker icon -> color map
scripts/
  parse-css.mjs       CSS -> { phosphor, domocons } name/codepoint maps
  build.mjs           font glyphs -> dist/ SVGs + gallery
  capture-picker.js   playwriter script to refresh picker-icons.json
dist/                 build output (gitignored; published by CI)
```
