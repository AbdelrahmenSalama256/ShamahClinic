/**
 * S2 — what the browser is actually sent, not what the source says.
 *
 * `console-isolation.test.ts` proves the two import graphs never meet in the source tree.
 * This suite reads the **build output**: every emitted stylesheet chunk, and the CSS list
 * Next records for each route's root layout in its client-reference manifests. The failure
 * it prevents is the one source graphs cannot see — a stylesheet that enters through a
 * framework boundary (`global-not-found`, a shared client module, a PostCSS plugin) rather
 * than through a file the console imports.
 *
 * The route→chunk mapping is `entryCSSFiles` inside `server/app/**\/page_client-reference-manifest.js`.
 * The key for each entry is the absolute path of the layout/page that owns it, so the suite
 * matches on the folder name, not on a machine-specific prefix.
 *
 * A build must exist. `NEXT_DIST_DIR` names it; the default is `.next-build`, the throwaway
 * directory the deploy build writes. Without one the suite skips and says which command to
 * run — a missing build is not a pass, it is an absence of evidence.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DIST = process.env.NEXT_DIST_DIR || '.next-build';
const APP_DIR = join(ROOT, DIST, 'server/app');
const CSS_DIR = join(ROOT, DIST, 'static/css');

const hasBuild = existsSync(APP_DIR) && existsSync(CSS_DIR);
if (!hasBuild) {
  console.warn(
    `[built-css] no build at ${DIST}; run \`NEXT_DIST_DIR=${DIST} npm run build\` to enable this suite.`,
  );
}

type Kind = 'console' | 'site' | 'fonts' | 'other';

function kindOf(css: string): Kind {
  if (/@layer reset, tokens, kit, screens;/.test(css)) return 'console';
  if (/tailwindcss v4|--tw-/.test(css)) return 'site';
  // `next/font` emits the faces plus two utility classes (`. __className_…` for the family,
  // `.__variable_…` for the font variable). Both surfaces get this chunk, so it is the one
  // legitimate share — only a chunk made of faces and those two rules counts as fonts.
  const withoutFacesAndVars = css
    .replace(/@font-face\{[^}]*\}/g, '')
    .replace(/\.__className_[\w]+\{[^}]*\}/g, '')
    .replace(/\.__variable_[\w]+\{[^}]*\}/g, '');
  if (/@font-face\{/.test(css) && withoutFacesAndVars.trim() === '') return 'fonts';
  return 'other';
}

function pageManifests(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pageManifests(path, found);
    else if (entry.name === 'page_client-reference-manifest.js') found.push(path);
  }
  return found;
}

/** `entryCSSFiles` as `{ owner, chunks[] }`, owner normalised to forward slashes. */
function entryCss(manifest: string): { owner: string; chunks: string[] }[] {
  const text = readFileSync(manifest, 'utf8');
  const start = text.indexOf('"entryCSSFiles"');
  if (start < 0) return [];
  const end = text.indexOf('"entryJSFiles"', start);
  const segment = text.slice(start, end > 0 ? end : undefined);
  const out: { owner: string; chunks: string[] }[] = [];
  for (const match of segment.matchAll(/"((?:[^"\\]|\\.)*)":\[([^\]]*)\]/g)) {
    const owner = match[1]!.replace(/\\\\/g, '/');
    const chunks = [...match[2]!.matchAll(/static\/css\/[\w]+\.css/g)].map((hit) => hit[0]);
    out.push({ owner, chunks });
  }
  return out;
}

const cssFiles = hasBuild ? readdirSync(CSS_DIR).filter((name) => name.endsWith('.css')) : [];
const kinds = new Map<string, Kind>();
for (const name of cssFiles) {
  kinds.set(`static/css/${name}`, kindOf(readFileSync(join(CSS_DIR, name), 'utf8')));
}

const manifests = hasBuild ? pageManifests(APP_DIR) : [];
const routeOf = (path: string): string => relative(APP_DIR, path).replace(/\\/g, '/');
// The console lives in a route group (`src/app/(console)/console`), so every manifest under
// it starts with `(console)/`; the public tree starts with the `[lang]` segment.
const consoleRoutes = manifests.filter((path) => routeOf(path).startsWith('(console)/'));
const siteRoutes = manifests.filter((path) => routeOf(path).startsWith('[lang]/'));

describe.skipIf(!hasBuild)('the built CSS keeps the two surfaces apart (S2)', () => {
  it('emits a console chunk, a site chunk and the shared font chunk', () => {
    const found = [...kinds.values()];
    expect(found, 'the console sheet is missing from the build').toContain('console');
    expect(found, 'the site sheet is missing from the build').toContain('site');
    expect(found, 'the font chunk is missing from the build').toContain('fonts');
  });

  it('never mixes a console rule with a Tailwind or site token in one chunk', () => {
    for (const [chunk, kind] of kinds) {
      const css = readFileSync(join(ROOT, DIST, chunk), 'utf8');
      if (kind === 'console') {
        expect(css, `${chunk} is a console chunk that carries Tailwind`).not.toMatch(/--tw-|tailwindcss/);
        expect(css, `${chunk} is a console chunk that names a site class`).not.toMatch(/\.site-|\[data-surface=["']site/);
      }
      if (kind === 'site') {
        expect(css, `${chunk} is a site chunk that paints the console`).not.toMatch(/\.console-|\[data-surface=["']console/);
      }
    }
  });

  it('gives every console route a console-only layout chunk list', () => {
    expect(consoleRoutes.length, 'no console route in the build').toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const manifest of consoleRoutes) {
      for (const { owner, chunks } of entryCss(manifest)) {
        if (!owner.endsWith('/console/layout')) continue;
        for (const chunk of chunks) {
          const kind = kinds.get(chunk);
          if (kind !== 'console' && kind !== 'fonts') offenders.push(`${relative(APP_DIR, manifest)} → ${owner} → ${chunk} (${kind})`);
        }
      }
    }
    expect(offenders, 'a console route loads a stylesheet that is not the console kit or the font').toEqual([]);
  });

  it('gives every public route a site-only layout chunk list', () => {
    expect(siteRoutes.length, 'no public route in the build').toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const manifest of siteRoutes) {
      for (const { owner, chunks } of entryCss(manifest)) {
        if (!owner.endsWith('/[lang]/layout')) continue;
        for (const chunk of chunks) {
          const kind = kinds.get(chunk);
          if (kind !== 'site' && kind !== 'fonts') offenders.push(`${relative(APP_DIR, manifest)} → ${owner} → ${chunk} (${kind})`);
        }
      }
    }
    expect(offenders, 'a public route loads a stylesheet that is not the site sheets or the font').toEqual([]);
  });

  it('lets no chunk be claimed by both surfaces', () => {
    const consoleLayouts = new Set<string>();
    const siteLayouts = new Set<string>();
    for (const manifest of manifests) {
      for (const { owner, chunks } of entryCss(manifest)) {
        if (owner.endsWith('/console/layout')) chunks.forEach((chunk) => consoleLayouts.add(chunk));
        if (owner.endsWith('/[lang]/layout')) chunks.forEach((chunk) => siteLayouts.add(chunk));
      }
    }
    for (const chunk of consoleLayouts) {
      if (kinds.get(chunk) === 'fonts') continue;
      expect(siteLayouts.has(chunk), `${chunk} is loaded by both root layouts`).toBe(false);
    }
  });
});
