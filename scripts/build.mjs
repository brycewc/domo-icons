import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import opentype from 'opentype.js';
import { parseCss } from './parse-css.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DEC = 2; // decimal places for path coordinates

const FONTS = [
  { key: 'phosphor', file: 'fonts/phosphor.woff' },
  { key: 'domocons', file: 'fonts/domocons.woff' },
];

/**
 * Build per-glyph geometry for a font.
 *
 * The box side is the largest glyph dimension across the font (so nothing is
 * ever clipped), and the shared unit scale is preserved so icons keep their true
 * relative sizes. Crucially, **each glyph is centered by its own bounding box**
 * within that square — the font's glyphs are not individually centered on the
 * em, so without this a glyph like `clock` renders noticeably off to one side.
 */
function makeFontGeometry(font, names) {
  const em = font.unitsPerEm;
  let side = 0;
  for (const cp of Object.values(names)) {
    const g = font.charToGlyph(String.fromCodePoint(cp));
    const bb = g.getBoundingBox();
    if (!isFinite(bb.x1) || bb.x1 === bb.x2) continue; // empty glyph
    side = Math.max(side, bb.x2 - bb.x1, bb.y2 - bb.y1);
  }
  return {
    side,
    em,
    /** SVG path `d` for a glyph, centered in the shared [0..side] square (unit scale). */
    pathData(cp) {
      const g = font.charToGlyph(String.fromCodePoint(cp));
      const bb = g.getBoundingBox(); // font units, y-up
      const ccx = (bb.x1 + bb.x2) / 2;
      const ccy = (bb.y1 + bb.y2) / 2;
      // getPath(ox, oy, em): (fx,fy) -> (ox+fx, oy-fy). Put glyph center at (side/2, side/2).
      return g.getPath(side / 2 - ccx, side / 2 + ccy, em).toPathData(DEC);
    },
    /** Tight glyph path (y-down, baseline 0) plus its own center/size, for the colored variant. */
    tight(cp) {
      const g = font.charToGlyph(String.fromCodePoint(cp));
      const p = g.getPath(0, 0, em);
      const b = p.getBoundingBox(); // y-down
      return {
        d: p.toPathData(DEC),
        cx: (b.x1 + b.x2) / 2,
        cy: (b.y1 + b.y2) / 2,
        max: Math.max(b.x2 - b.x1, b.y2 - b.y1),
      };
    },
  };
}

function svgIcon(side, d) {
  const s = round(side);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" fill="currentColor"><path d="${d}"/></svg>\n`;
}

function round(n, dec = DEC) {
  return Number(n.toFixed(dec));
}

function writeSvg(dir, name, contents) {
  writeFileSync(join(dir, `${name}.svg`), contents);
}

function main() {
  // Fresh output tree.
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, '.nojekyll'), '');

  const maps = parseCss(join(ROOT, 'style.css'));
  const geometry = {}; // key -> { side, pathData }
  const catalog = {}; // key -> [names] sorted

  for (const { key, file } of FONTS) {
    const font = opentype.loadSync(join(ROOT, file));
    const names = maps[key];
    const geo = makeFontGeometry(font, names);
    geometry[key] = geo;

    const outDir = join(DIST, key);
    mkdirSync(outDir, { recursive: true });
    const sorted = Object.keys(names).sort();
    for (const name of sorted) {
      writeSvg(outDir, name, svgIcon(geo.side, geo.pathData(names[name])));
    }
    catalog[key] = sorted;
    console.log(`${key}: ${sorted.length} icons -> dist/${key}/`);
  }

  const colored = buildColored(maps, geometry);
  writeFileSync(join(DIST, 'index.html'), gallery(catalog, colored));
  console.log(`index: dist/index.html`);
}

/**
 * Colored circular-background variants for exactly the approval-form picker's
 * icons, driven by data/picker-icons.json (captured via scripts/capture-picker.mjs).
 * Picker icons come from the phosphor set (Domo's current UI font).
 */
function buildColored(maps, geometry) {
  const dataPath = join(ROOT, 'data', 'picker-icons.json');
  if (!existsSync(dataPath)) {
    console.warn('colored: data/picker-icons.json not found — skipping colored variants');
    return [];
  }
  const picker = JSON.parse(readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(picker) || picker.length === 0) {
    console.warn('colored: picker-icons.json is empty — skipping');
    return [];
  }
  const outDir = join(DIST, 'colored');
  mkdirSync(outDir, { recursive: true });

  // Match Domo's picker 1:1: a 30px bubble with the icon rendered at font-size
  // 24px, at the font's natural (non-normalized) size. Emitting width/height=30
  // makes the SVG's default size Domo's actual size.
  const BUBBLE_PX = 30;  // circle diameter / viewBox
  const FONT_PX = 24;    // icon font-size
  const C = BUBBLE_PX / 2;
  const geo = geometry.phosphor;
  const k = FONT_PX / geo.em; // font unit -> px (em spans FONT_PX)
  const built = [];
  const missing = [];

  for (const entry of picker) {
    const { name, bg, fg = '#ffffff' } = entry;
    const cp = maps.phosphor[name];
    if (cp === undefined) { missing.push(name); continue; }
    // Center the glyph's own bbox on the circle at Domo's fixed font scale.
    const g = geo.tight(cp);
    const tx = C - k * g.cx;
    const ty = C - k * g.cy;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${BUBBLE_PX}" height="${BUBBLE_PX}" viewBox="0 0 ${BUBBLE_PX} ${BUBBLE_PX}">` +
      `<circle cx="${C}" cy="${C}" r="${C}" fill="${bg}"/>` +
      `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(k, 4)})">` +
      `<path d="${g.d}" fill="${fg}"/></g></svg>\n`;
    writeSvg(outDir, name, svg);
    built.push({ name, bg, fg });
  }
  if (missing.length) console.warn(`colored: ${missing.length} picker names not in phosphor: ${missing.join(', ')}`);
  console.log(`colored: ${built.length} variants -> dist/colored/`);
  return built;
}

function gallery(catalog, colored) {
  const cell = (font, name) =>
    `<figure><img loading="lazy" src="./${font}/${name}.svg" alt="${name}"><figcaption>${name}</figcaption></figure>`;
  const coloredCell = (c) =>
    `<figure><img loading="lazy" src="./colored/${c.name}.svg" alt="${c.name}"><figcaption>${c.name}</figcaption></figure>`;
  const section = (title, html) => `<h2>${title}</h2><div class="grid">${html}</div>`;
  const parts = [];
  if (colored.length) parts.push(section(`Colored (${colored.length})`, colored.map(coloredCell).join('')));
  for (const font of Object.keys(catalog)) {
    parts.push(section(`${font} (${catalog[font].length})`, catalog[font].map((n) => cell(font, n)).join('')));
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Domo Icons</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:0;padding:24px;color:#1a1a2e}
  h1{margin:0 0 4px}
  h2{margin:32px 0 12px;text-transform:capitalize}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:12px}
  figure{margin:0;padding:10px;border:1px solid #eee;border-radius:8px;text-align:center;background:#fff}
  figure img{width:32px;height:32px;color:#333}
  figcaption{margin-top:6px;font-size:11px;color:#666;word-break:break-word}
</style></head><body>
<h1>Domo Icons</h1>
<p>Each icon is an individual SVG. Reference by URL, e.g. <code>./phosphor/clock.svg</code>. Monochrome icons use <code>currentColor</code>.</p>
${parts.join('\n')}
</body></html>\n`;
}

main();
