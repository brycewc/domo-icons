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

You can also publish arbitrary files (PNG/JPG/etc.) that don't come from a font — see
[Static files](#static-files).

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

## Dynamic colored icons in Beast Mode

The hosted `colored/` SVGs bake in a **fixed** background/icon color, so they only
cover Domo's built-in picker palette. To render an icon with **arbitrary** colors —
e.g. a Workspace's user-chosen background color, icon color, and background opacity —
you can't just append the colors to a static URL: GitHub Pages can't recolor a file
per request, an SVG loaded via `<img>` runs in "secure static mode" (no `currentColor`),
and inlining the glyph as a `data:` URI is a non-starter because the vector paths are
far too long to store in a Domo dataset column (median ~1.1 KB, up to ~10 KB).

The fix is a tiny [Cloudflare Worker](worker/index.js) that recolors the published
monochrome SVGs on the fly. It's a pure function of the URL, so a single **short**
link renders any icon in any colors, and Beast Mode never touches path data:

```
https://<your-worker-domain>/<font>/<name>?bg=<hex>&fg=<hex>&o=<0..1>&r=<0..0.5>&size=<px>
```

- `bg` background color hex (no `#`); omit for a transparent background
- `fg` icon color hex (no `#`, default `000000`)
- `o`  background opacity `0..1` (default `1`) — applies only to the background

Colors accept 3-, 6-, or 8-digit hex. An 8-digit color's alpha (`RRGGBBAA`) is
honored: it's folded into the fill's opacity, so `bg=FFFFFF00` is fully transparent
and `fg=000000` `80` gives a half-opaque icon. For a background, that alpha
**multiplies** with `o` (both dim it) — so if you already encode opacity in an
8-digit `bg`, leave `o` at its default of `1` to avoid dimming it twice.
- `r`  corner radius as a fraction of the box (default `0.18`; `0` = square, `0.5` = circle)
- `size` pixel width/height stamped on the SVG (default `40`) — needed so hosts
  like Domo scale the icon instead of rendering it full-size and clipping it
- `font` optional path segment, `phosphor` (default) or `domocons` — `/<name>` alone works too

**Beast Mode** for a Workspace with `Icon` = `workspace`, `Background Color` = `#73B0D7`,
`Icon Color` = `#FFFFFF`, `Icon Opacity` = `0.70`:

```sql
CONCAT(
  '<img width="40" height="40" src="https://<your-worker-domain>/', `Icon`,
  '?bg=', REPLACE(`Background Color`, '#', ''),
  '&fg=', REPLACE(`Icon Color`, '#', ''),
  '&o=', `Icon Opacity`,
  '"/>'
)
```

### Deploy the Worker

Requires a (free) Cloudflare account. From the repo root:

```bash
yarn install                 # installs wrangler (a devDependency)
yarn wrangler login          # one-time browser auth
yarn worker:deploy           # deploys worker/index.js, prints the *.workers.dev URL
yarn worker:dev              # optional: run locally at http://localhost:8787
```

Config lives in [`wrangler.toml`](wrangler.toml). The `ICONS_BASE` var points at the
published SVGs (`https://<owner>.github.io/domo-icons`) — update it if you fork/rename
the repo or serve the icons from a custom domain. To put the Worker on your own domain,
add a route in the Cloudflare dashboard (or a `[[routes]]` block in `wrangler.toml`).

Every push to `main` also redeploys the Worker automatically via
[`.github/workflows/worker.yml`](.github/workflows/worker.yml). It needs two repo
secrets (**Settings → Secrets and variables → Actions**):

- `CLOUDFLARE_API_TOKEN` — a token with the **Edit Cloudflare Workers** permission
  (create at *My Profile → API Tokens*, "Edit Cloudflare Workers" template).
- `CLOUDFLARE_ACCOUNT_ID` — from any domain's overview page, or `wrangler whoami`.

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
4. Copies the committed [`static/`](static/) tree verbatim into `dist/` (see
   [Static files](#static-files)).
5. Writes a gallery `index.html` and a `.nojekyll` marker into `dist/`.

The build is fully offline — no browser or network — so it runs unchanged in CI.

## Static files

`dist/` is wiped on every build and is gitignored, so you can't drop files into it
directly. Put hand-added assets — PNGs, JPGs, anything that doesn't come from a font —
under [`static/`](static/) instead. The build copies that tree verbatim into `dist/`,
so each file publishes at the matching path:

```
static/images/logo.png   ->   https://<owner>.github.io/domo-icons/images/logo.png
```

No build changes or processing — just add the file, commit it, and push (CI runs
`yarn build` and publishes). Locally, run `yarn build` and it appears under `dist/`.

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
static/               hand-added files copied verbatim into dist/ (e.g. images/)
scripts/
  parse-css.mjs       CSS -> { phosphor, domocons } name/codepoint maps
  build.mjs           font glyphs -> dist/ SVGs + gallery
  capture-picker.js   playwriter script to refresh picker-icons.json
worker/
  index.js            Cloudflare Worker: recolors published SVGs on the fly
wrangler.toml         Worker config (deploy target + ICONS_BASE)
dist/                 build output (gitignored; published by CI)
```
