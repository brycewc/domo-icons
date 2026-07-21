import { readFileSync } from 'node:fs';

/**
 * Parse the Domo icon stylesheet into { name -> codepoint } maps for each font.
 *
 *   .icon-<name>:before        { content: "\XXXX" }   -> phosphor
 *   .legacy-icon-<name>:before { content: "\XXXX" }   -> domocons
 *
 * The generic `[class^="icon-"]` helper rules carry no `content:` codepoint and
 * are naturally skipped by the regex below.
 *
 * @param {string} cssPath absolute path to style.css
 * @returns {{ phosphor: Record<string, number>, domocons: Record<string, number> }}
 */
export function parseCss(cssPath) {
  const css = readFileSync(cssPath, 'utf8');
  // legacy-icon must be tried before icon; the leading `.` prevents matching
  // the `icon` inside `legacy-icon`.
  const re = /\.(legacy-icon|icon)-([A-Za-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-fA-F]+)"/g;

  const phosphor = {};
  const domocons = {};
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, prefix, name, hex] = m;
    const cp = parseInt(hex, 16);
    if (prefix === 'legacy-icon') domocons[name] = cp;
    else phosphor[name] = cp;
  }
  return { phosphor, domocons };
}

// Allow `node scripts/parse-css.mjs` for a quick sanity check.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const maps = parseCss(join(root, 'style.css'));
  console.log('phosphor icons:', Object.keys(maps.phosphor).length);
  console.log('domocons icons:', Object.keys(maps.domocons).length);
  console.log('sample phosphor.clock =', maps.phosphor.clock?.toString(16));
  console.log('sample domocons.toolbox =', maps.domocons.toolbox?.toString(16));
}
