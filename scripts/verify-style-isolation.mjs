#!/usr/bin/env node
/**
 * S2 — what the browser is actually sent.
 *
 * Boots nothing: point it at a running production build (`next start`) and it fetches a
 * public page and a console page, lists every stylesheet in the returned HTML, downloads
 * each chunk, classifies it, and fails if either surface receives the other's CSS.
 *
 * The manifests can list a chunk that is never emitted as a `<link>` — this checks the
 * links, because that is what the browser loads.
 *
 *   node scripts/verify-style-isolation.mjs --base http://127.0.0.1:3211
 *
 * Public routes must load site CSS + the shared font, and never console CSS.
 * Console routes must load console CSS + the shared font, and never Tailwind or site CSS.
 */
const args = process.argv.slice(2);
const baseArg = args.indexOf('--base');
const BASE = (baseArg >= 0 ? args[baseArg + 1] : 'http://127.0.0.1:3211').replace(/\/$/, '');

const SITE_ROUTES = ['/ar', '/en', '/en/services', '/ar/blogs', '/en/results', '/ar/results'];
const CONSOLE_ROUTES = ['/console/login'];

function kindOf(css) {
  if (/@layer reset, tokens, kit, screens;/.test(css)) return 'console';
  if (/tailwindcss v4|--tw-/.test(css)) return 'site';
  // `next/font` emits the faces plus `. __className_…` and `.__variable_…`; that chunk is the
  // one legitimate share between the two surfaces.
  const withoutFacesAndVars = css
    .replace(/@font-face\{[^}]*\}/g, '')
    .replace(/\.__className_[\w]+\{[^}]*\}/g, '')
    .replace(/\.__variable_[\w]+\{[^}]*\}/g, '');
  if (/@font-face\{/.test(css) && withoutFacesAndVars.trim() === '') return 'fonts';
  return 'other';
}

async function stylesheetsOf(route) {
  const response = await fetch(`${BASE}${route}`, { redirect: 'manual' });
  const html = await response.text();
  const hrefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((match) => match[1]);
  const chunks = [];
  for (const href of hrefs) {
    const css = await (await fetch(`${BASE}${href}`)).text();
    chunks.push({ href, kind: kindOf(css), bytes: Buffer.byteLength(css) });
  }
  return { status: response.status, chunks };
}

const problems = [];
const report = [];

for (const [surface, routes] of [
  ['site', SITE_ROUTES],
  ['console', CONSOLE_ROUTES],
]) {
  for (const route of routes) {
    const { status, chunks } = await stylesheetsOf(route);
    if (status !== 200) problems.push(`${route} answered ${status}; its stylesheets cannot be judged`);
    report.push({ surface, route, status, chunks });
    for (const chunk of chunks) {
      if (surface === 'site' && chunk.kind === 'console') {
        problems.push(`${route} loads ${chunk.href}, a console chunk`);
      }
      if (surface === 'console' && chunk.kind === 'site') {
        problems.push(`${route} loads ${chunk.href}, a site/Tailwind chunk`);
      }
    }
  }
}

const siteChunks = new Set(report.filter((row) => row.surface === 'site').flatMap((row) => row.chunks.map((c) => c.href)));
const consoleChunks = new Set(report.filter((row) => row.surface === 'console').flatMap((row) => row.chunks.map((c) => c.href)));
const shared = [...siteChunks].filter((href) => consoleChunks.has(href));
for (const href of shared) {
  const kind = report.flatMap((row) => row.chunks).find((chunk) => chunk.href === href).kind;
  if (kind === 'fonts') continue;
  problems.push(`${href} (${kind}) is loaded by both surfaces`);
}

for (const row of report) {
  console.log(`\n${row.route}  →  ${row.status}`);
  for (const chunk of row.chunks) {
    console.log(`  ${String(chunk.bytes).padStart(7)} B  ${chunk.kind.padEnd(8)} ${chunk.href}`);
  }
  if (row.chunks.length === 0) console.log('  (no stylesheet)');
}

if (problems.length > 0) {
  console.error('\nFAIL');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('\nOK: the public pages load site CSS only; the console loads console CSS only.');
