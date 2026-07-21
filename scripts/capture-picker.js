/*
 * Refresh data/picker-icons.json from Domo's live approval-form icon picker.
 *
 * This is NOT a Node script — it runs inside the playwriter sandbox against the
 * user's real (authenticated) browser, because the picker only exists in the
 * logged-in Domo app. The regular `yarn build` reads the committed JSON and does
 * NOT need a browser, so CI stays hermetic.
 *
 * Usage (see README "Refreshing picker colors"):
 *   1. In Chrome/Edge, open an approval form editor and open the icon picker
 *      (click a template row's icon bubble) so the grid is visible.
 *   2. playwriter session new --browser direct:9222   # or via the extension
 *   3. playwriter -s <id> -f scripts/capture-picker.js
 *
 * Globals available in the sandbox: context, state, require, console.
 */

const fs = require('node:fs');

// Non-icon controls that live inside the picker container (search bar + chevron).
const CHROME = new Set(['search', 'chevron-down']);

const rgbToHex = (s) => {
  const m = s && s.match(/rgba?\(([^)]+)\)/);
  if (!m) return s || null;
  const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x.trim()));
  const h = (n) => n.toString(16).padStart(2, '0');
  return a !== undefined && a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `#${h(r)}${h(g)}${h(b)}`;
};

const form = context.pages().find((p) => p.url().includes('/approval/edit-request-form/'));
if (!form) throw new Error('No approval-form tab found. Open the form + icon picker first.');

// Reveal the full curated set if a "Show More" control is present.
const showMore = form.locator('[class*="module_showMore"]');
if (await showMore.count()) {
  await showMore.first().click();
  await form.waitForTimeout(800);
}

const icons = await form.evaluate(() => {
  const cont = document.querySelector('[class*="providerSelectContainer"]');
  if (!cont) return null;
  const seen = new Set();
  const out = [];
  cont.querySelectorAll('i[class*="icon-"], span[class*="icon-"]').forEach((el) => {
    const cls = [...el.classList].find((c) => /^icon-/.test(c));
    if (!cls) return;
    const name = cls.replace(/^icon-/, '');
    if (seen.has(name)) return;
    seen.add(name);
    let node = el;
    let bg = null;
    for (let i = 0; i < 4 && node; i++, node = node.parentElement) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
    }
    out.push({ name, bg, fg: getComputedStyle(el).color });
  });
  return out;
});

if (!icons) throw new Error('Picker container not found. Make sure the icon picker is open.');

const cleaned = icons
  .filter((i) => !CHROME.has(i.name) && i.bg)
  .map((i) => ({ name: i.name, bg: rgbToHex(i.bg), fg: rgbToHex(i.fg) }));

fs.writeFileSync('data/picker-icons.json', JSON.stringify(cleaned, null, 2) + '\n');
console.log(`Wrote ${cleaned.length} picker icons to data/picker-icons.json`);
console.log(cleaned.map((i) => `${i.name} ${i.bg}`).join('\n'));
