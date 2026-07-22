/**
 * Dynamic colored-icon endpoint for Domo Beast Mode (and anywhere else).
 *
 * Recolors the monochrome SVGs published to GitHub Pages on the fly, so a single
 * short URL can render any icon with an arbitrary background color, icon color,
 * corner radius, and background opacity — no glyph path data ever touches Domo.
 *
 *   GET /<name>                     -> phosphor icon, plain (icon color = black)
 *   GET /<font>/<name>?<params>     -> font ∈ {phosphor, domocons}
 *
 * Query params (all optional):
 *   bg   background color, hex without '#' (e.g. 73B0D7). Omit for no background.
 *   fg   icon color, hex without '#' (default 000000).
 *   o    background opacity, 0..1 (default 1). Applies only to the background.
 *   r    corner radius as a fraction of the icon box, 0..0.5 (default 0.18;
 *        0 = square, 0.5 = circle). Only meaningful with bg.
 *   size pixel width/height to stamp on the <svg> (default 40). An <img>-embedded
 *        SVG needs a concrete intrinsic size or some hosts render it full-size and
 *        clip it to the cell.
 *
 * Example (Domo Workspace: blue bg @ 70%, white icon):
 *   /workspace?bg=73B0D7&fg=FFFFFF&o=0.7
 */

const FONTS = new Set(['phosphor', 'domocons']);
const HEX = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/;
const NAME = /^[a-z0-9-]+$/; // matches the published SVG filenames

const CACHE_SECONDS = 60 * 60 * 24; // 1 day (no `immutable`) so bug fixes reach viewers

// Bump whenever the *output* of the SVG assembly changes. It's mixed into the
// edge cache key, so a redeploy with a new version bypasses every stale entry
// (a plain redeploy does NOT clear Cloudflare's Cache API on its own).
const CACHE_VERSION = 2;

function bad(status, message) {
  return new Response(message + '\n', {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** Clamp a parsed float to [lo, hi]; returns fallback if not a finite number. */
function clampNum(raw, lo, hi, fallback) {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null; // signal invalid
  return Math.min(hi, Math.max(lo, n));
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return bad(405, 'Method not allowed');
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    let font = 'phosphor';
    let name;
    if (segments.length === 1) {
      name = segments[0];
    } else if (segments.length === 2) {
      [font, name] = segments;
    } else {
      return bad(404, 'Use /<name> or /<font>/<name>');
    }

    if (!FONTS.has(font)) return bad(404, `Unknown font "${font}"`);
    if (!name || !NAME.test(name)) return bad(400, 'Invalid icon name');

    const q = url.searchParams;
    const bg = q.get('bg');
    const fg = q.get('fg') ?? '000000';
    if (bg != null && !HEX.test(bg)) return bad(400, 'bg must be a 3/6/8-digit hex color (no #)');
    if (!HEX.test(fg)) return bad(400, 'fg must be a 3/6/8-digit hex color (no #)');

    const opacity = clampNum(q.get('o'), 0, 1, 1);
    if (opacity === null) return bad(400, 'o (opacity) must be a number 0..1');
    const radius = clampNum(q.get('r'), 0, 0.5, 0.18);
    if (radius === null) return bad(400, 'r (radius) must be a number 0..0.5');
    // An SVG served to an <img> needs a concrete intrinsic size — with only a
    // viewBox, some hosts (Domo table cells among them) render it at native scale
    // and clip it to the cell, showing just the corner. Default to 40px.
    const size = clampNum(q.get('size'), 1, 4096, 40);
    if (size === null) return bad(400, 'size must be a number 1..4096');

    // Serve from Cloudflare's edge cache when we can — the recolored result is a
    // pure function of the URL + CACHE_VERSION. Mixing the version into the key
    // means bumping it retires every stale entry across a redeploy.
    const cache = caches.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.searchParams.set('__v', String(CACHE_VERSION));
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Reuse the already-published monochrome SVG as the source of truth for the
    // glyph geometry — no path data is duplicated here.
    const base = (env.ICONS_BASE || 'https://brycewc.github.io/domo-icons').replace(/\/+$/, '');
    const upstream = await fetch(`${base}/${font}/${encodeURIComponent(name)}.svg`, {
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (upstream.status === 404) return bad(404, `No "${name}" in ${font}`);
    if (!upstream.ok) return bad(502, `Upstream ${upstream.status} fetching source icon`);

    const src = await upstream.text();
    const side = (src.match(/viewBox="0 0 ([\d.]+) [\d.]+"/) || [])[1];
    const inner = (src.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [])[1];
    if (!side || inner == null) return bad(502, 'Unexpected source icon format');

    const dim = ` width="${size}" height="${size}"`;
    // Root fill drives the glyph color (inner <path> has no fill of its own, so it
    // inherits). The background <rect> carries its own fill + opacity.
    const rect =
      bg == null
        ? ''
        : `<rect width="${side}" height="${side}" rx="${round(side * radius)}" fill="#${bg}" fill-opacity="${opacity}"/>`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"${dim} fill="#${fg}">` +
      rect +
      inner +
      `</svg>`;

    const response = new Response(svg, {
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': `public, max-age=${CACHE_SECONDS}`,
        'access-control-allow-origin': '*',
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  },
};

function round(n) {
  return Math.round(n * 100) / 100;
}
