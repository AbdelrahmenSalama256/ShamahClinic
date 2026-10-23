/**
 * BK-5 — the console as its own app.
 *
 * Three things are worth proving here rather than reading: that the `/console`
 * path never picks up a language rewrite, that locale and theme are decided in
 * one documented order, and that the sidebar only offers screens that exist and
 * that the caller may actually open.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { loginHandler } from '../src/lib/auth/login';
import { getOrCreateRole, assignRole, createUser } from '../src/lib/auth/users';
import { loadGrants } from '../src/lib/auth/sessions';
import { ROLE_SEEDS, SITE_LOCALES, LIST_KEYS, permissionsFor, type RoleName } from '../src/lib/auth/roles';
import type { Grant } from '../src/lib/auth/permissions';
import { decideRoute, isConsolePath } from '../src/lib/site-routing';
import { siteTheme } from '../src/config/site';
import { callResult } from '../src/components/console/client-api';
import {
  DEFAULT_PREFS,
  decodePrefs,
  dirOf,
  encodePrefs,
  localeFromAcceptLanguage,
  resolvePrefs,
} from '../src/lib/console/prefs';
import { CONSOLE_SCREENS, navStrip, navTree, palettePlaces, visibleScreens } from '../src/lib/console/screens';
import { message, type MessageKey } from '../src/lib/console/messages';
import { overviewRows } from '../src/lib/console/overview';
import { updatePrefsHandler } from '../src/lib/console/prefs-route';
import { searchRows } from '../src/lib/console/search';
import { likeOf } from '../src/lib/db/like';
import { searchHandler } from '../src/lib/console/search-route';
import { createRow, getRow, saveDraft } from '../src/lib/content/store';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-console-2026';
const ownerEmail = `bk5-owner-${run}@example.invalid`;
const viewerEmail = `bk5-viewer-${run}@example.invalid`;
const noReadEmail = `bk13-noread-${run}@example.invalid`;
/** The one article this file writes, so the palette has a record to find. */
const searchKey = `bk13-${run}-palette`;

const userIds: string[] = [];
const roleIds: string[] = [];
let ownerId = '';
let viewerId = '';
let ipSeq = 0;

const consoleDir = join(process.cwd(), 'src/app/console');

/** The seed role's grants, as the sidebar sees them. */
function grantsFor(name: RoleName): Grant[] {
  const seed = ROLE_SEEDS.find((role) => role.name === name);
  return seed ? permissionsFor(seed).map((row) => ({ ...row })) : [];
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', `203.0.113.${++ipSeq % 254}`);
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

async function login(email: string): Promise<{ token: string; csrf: string }> {
  const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email, password: PASSWORD }) }));
  const body = (await res.json()) as { csrfToken?: string };
  return { token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken ?? '' };
}

/** Every page file under the console, as the URL it serves. Route groups are transparent. */
function pagePaths(dir: string, prefix: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const grouped = entry.startsWith('(') && entry.endsWith(')');
      return pagePaths(full, grouped ? prefix : `${prefix}/${entry}`);
    }
    return entry === 'page.tsx' ? [prefix] : [];
  });
}

function consoleSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) files.push(readFileSync(full, 'utf8'));
    }
  };
  walk(consoleDir);
  walk(join(process.cwd(), 'src/components/console'));
  return files;
}

beforeAll(async () => {
  assertTestDb();

  ownerId = await getOrCreateRole('Owner', { is_system: true, is_owner: true });
  const viewer = ROLE_SEEDS.find((role) => role.name === 'Viewer');
  if (!viewer) throw new Error('the Viewer role vanished from the catalog');
  const viewerName = `bk5-viewer-role-${run}`;
  viewerId = await getOrCreateRole(viewerName, { is_system: false });
  roleIds.push(viewerId);

  await db
    .insertInto('role_permissions')
    .values(permissionsFor(viewer).map((row) => ({ id: randomUUID(), role_id: viewerId, resource: row.resource, action: row.action, scope: json(row.scope) })))
    .execute();

  // A role that reads leads and nothing titled: the palette's route has to answer 403
  // for it, because `article`/`offer`/`page` are three resources and it holds none.
  const noReadRole = `bk13-noread-role-${run}`;
  const noReadRoleId = await getOrCreateRole(noReadRole, { is_system: false });
  roleIds.push(noReadRoleId);
  await db
    .insertInto('role_permissions')
    .values({ id: randomUUID(), role_id: noReadRoleId, resource: 'lead', action: 'read', scope: json(null) })
    .execute();

  userIds.push(
    await createUser({ email: ownerEmail, password: PASSWORD, name: 'BK5 Owner' }),
    await createUser({ email: viewerEmail, password: PASSWORD, name: 'BK5 Viewer' }),
    await createUser({ email: noReadEmail, password: PASSWORD, name: 'BK13 Leads only' }),
  );
  await assignRole(userIds[0], ownerId);
  await assignRole(userIds[1], viewerId);
  await assignRole(userIds[2], noReadRoleId);

  // One titled row for the palette to find: the search reads the draft columns, and
  // Arabic is the site's primary language, so a hit must carry the Arabic title and the
  // path must be the deep link `?key=` that opens the row.
  const created = await createRow('article', { key: searchKey, actorId: userIds[0] });
  if (!created.ok) throw new Error(`the article for the palette could not be created: ${created.code}`);
  for (const [locale, title] of [
    ['ar', 'دليل الليزر البارد'],
    ['en', 'cold laser guide'],
  ] as const) {
    const row = await getRow('article', created.value.id);
    if (!row) throw new Error('the article for the palette disappeared');
    const saved = await saveDraft('article', { id: row.id, locale, fields: { title }, expectedVersion: row.version, actorId: userIds[0] });
    if (!saved.ok) throw new Error(`the article for the palette could not be saved (${locale}): ${saved.code}`);
  }
});

afterAll(async () => {
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', [ownerEmail, viewerEmail, noReadEmail]).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('role_permissions').where('role_id', 'in', roleIds).execute();
    await db.deleteFrom('roles').where('id', 'in', roleIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  // The row this file created for the palette, and the history it wrote.
  const article = await db.selectFrom('articles').select('id').where('slug', '=', searchKey).executeTakeFirst();
  if (article) await db.deleteFrom('revisions').where('entity_id', '=', article.id).execute();
  await db.deleteFrom('articles').where('slug', '=', searchKey).execute();
  await destroyDb();
});

describe('the console never joins the language rewrite', () => {
  it('serves console paths as themselves', () => {
    for (const path of ['/console', '/console/', '/console/login', '/console/password', '/console/blogs/x']) {
      expect(decideRoute(path), path).toEqual({ lang: null, rewriteTo: null });
    }
    expect(isConsolePath('/consolex')).toBe(false);
  });

  it('still rewrites the site, and leaves a prefixed site URL alone', () => {
    expect(decideRoute('/')).toEqual({ lang: 'ar', rewriteTo: '/ar' });
    expect(decideRoute('/blogs')).toEqual({ lang: 'ar', rewriteTo: '/ar/blogs' });
    expect(decideRoute('/ar/blogs')).toEqual({ lang: 'ar', rewriteTo: null });
    expect(decideRoute('/en/offers/x')).toEqual({ lang: 'en', rewriteTo: null });
  });
});

describe('prefs resolution', () => {
  it('follows account, then cookie, then Accept-Language, then the site default', () => {
    expect(resolvePrefs({})).toEqual(DEFAULT_PREFS);
    expect(resolvePrefs({ acceptLanguage: 'en-US,en;q=0.9' })).toEqual({ locale: 'en', theme: 'light', density: 'comfortable' });
    expect(resolvePrefs({ cookie: 'en.dark', acceptLanguage: 'ar' })).toEqual({ locale: 'en', theme: 'dark', density: 'comfortable' });
    // The account wins: switching the console language must stick after signing in elsewhere.
    expect(resolvePrefs({ account: { locale: 'ar', theme: 'light' }, cookie: 'en.dark' })).toEqual({
      locale: 'ar',
      theme: 'light',
      density: 'comfortable',
    });
    // A stored value the catalog no longer knows about falls through instead of crashing.
    expect(resolvePrefs({ account: { locale: 'fr', theme: 'neon' }, cookie: 'en.dark' })).toEqual({
      locale: 'en',
      theme: 'dark',
      density: 'comfortable',
    });
  });

  it('takes density from the device, never from the account', () => {
    // `users` has no density column on purpose: a laptop and a phone on one account
    // want different rows per screen, so the cookie is the only store it has.
    expect(resolvePrefs({ account: { locale: 'ar', theme: 'light' }, cookie: 'ar.light.dense' })).toEqual({
      locale: 'ar',
      theme: 'light',
      density: 'dense',
    });
    expect(resolvePrefs({ cookie: 'en.dark.comfy' })).toEqual({ locale: 'en', theme: 'dark', density: 'comfortable' });
  });

  it('round-trips the cookie and refuses anything it does not recognise', () => {
    for (const locale of SITE_LOCALES) {
      for (const theme of ['light', 'dark'] as const) {
        for (const density of ['comfortable', 'dense'] as const) {
          expect(decodePrefs(encodePrefs({ locale, theme, density }))).toEqual({ locale, theme, density });
        }
      }
    }
    expect(decodePrefs('')).toEqual({});
    expect(decodePrefs('de.bright')).toEqual({});
    expect(decodePrefs('en')).toEqual({ locale: 'en' });
    // A cookie written before density existed still decodes; the missing term defaults.
    expect(decodePrefs('ar.dark')).toEqual({ locale: 'ar', theme: 'dark' });
    expect(decodePrefs('ar.dark.huge')).toEqual({ locale: 'ar', theme: 'dark' });
    expect(decodePrefs(';;drop-table;;')).toEqual({});
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });

  it('reads a browser preference without trusting its ordering', () => {
    expect(localeFromAcceptLanguage('ar-EG,ar;q=0.9,en;q=0.8')).toBe('ar');
    // Neither Arabic nor French is wanted; English is, so the console is English.
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('en');
    expect(localeFromAcceptLanguage('fr-FR,fr;q=0.9,de;q=0.8')).toBeNull();
    // A tag ranked at zero is a refusal, not a preference.
    expect(localeFromAcceptLanguage('en;q=0,fr')).toBeNull();
    expect(localeFromAcceptLanguage('ar-EG;q=0.0')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });
});

describe('the sidebar registry', () => {
  it('has a page file for every screen, and no page file outside it', () => {
    const registered = [...CONSOLE_SCREENS.map((screen) => screen.path), '/console/login'].sort();
    expect(pagePaths(consoleDir, '/console').sort()).toEqual(registered);
  });

  it('labels every screen in both languages', () => {
    for (const screen of CONSOLE_SCREENS) {
      for (const locale of SITE_LOCALES) {
        const label = message(`nav.${screen.key}` as MessageKey, locale);
        expect(label.length, `${screen.key} ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it('shows each role exactly the screens its grants cover', () => {
    // The two screens every role holds, plus what its `read` grants reach. Marketer
    // has no `list` grant and only Owner/Admin can read `setting`, so those rows are
    // the proof the sidebar is filtered by the catalog rather than hardcoded.
    const content = ['overview', 'articles', 'offers', 'pages'];
    const expected: Record<RoleName, string[]> = {
      Owner: [...content, 'lists', 'settings', 'password'],
      Admin: [...content, 'lists', 'settings', 'password'],
      Editor: [...content, 'lists', 'password'],
      SEO: [...content, 'lists', 'password'],
      Marketer: [...content, 'password'],
      Viewer: [...content, 'lists', 'password'],
    };
    for (const name of Object.keys(expected) as RoleName[]) {
      expect(visibleScreens(grantsFor(name)).map((screen) => screen.key), name).toEqual(expected[name]);
    }
    // No grants at all — an account whose role was never seeded still gets the shell.
    expect(visibleScreens([]).map((screen) => screen.key)).toEqual(['overview', 'password']);
  });
});

describe('the console is not the site', () => {
  it('imports no site shell, header or footer', () => {
    for (const source of consoleSources()) {
      expect(source).not.toMatch(/SiteShell|components\/layout|SiteHeader|SiteFooter/);
    }
  });

  it('tells crawlers to stay out', () => {
    const layout = readFileSync(join(consoleDir, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/index:\s*false/);
    expect(layout).toMatch(/data-surface="console"/);
  });
});

describe('the shell reaches every screen at every width (BK-13.1)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  const globalsText = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const frame = readFileSync(join(process.cwd(), 'src/components/console/ConsoleFrame.tsx'), 'utf8');

  it('has a sidebar column, an off-canvas drawer and a phone tab bar', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)/);
    expect(css).toMatch(/@media \(max-width: 639\.98px\)/);
    // The drawer opens from `data-nav` when there is script, and from the URL
    // fragment when there is not — losing the second half would break the BK-5 rule
    // that the console works with JavaScript off.
    expect(frame).toContain('href="#console-side"');
    expect(frame).toContain('aria-controls="console-side"');
    expect(frame).toContain('data-nav=');
    // One tree (sidebar column and drawer share it) and one phone strip: CSS shows
    // exactly one of the two per width.
    expect(frame).toContain('<ConsoleNavTree');
    expect(frame).toContain('<ConsoleNavStrip');
    expect((frame.match(/<ConsoleNavTree/g) ?? []).length).toBe(1);
  });

  it('holds the 44px tap floor at both densities', () => {
    // BK-19.3a moved the floor out of the console and into the shared control layer, so
    // the assertions moved with it: `--tap` is declared once in `globals.css`, the
    // primitive reads it, and the console reads the same name for the controls it still
    // paints itself. A second `--console-tap` would be a second floor.
    const ui = readFileSync(join(process.cwd(), 'src/components/ui/ui.css'), 'utf8');
    expect(globalsText).toMatch(/\n\s*--tap: 2\.75rem;/);
    expect(ui).toMatch(/\.ui-button\s*\{[^}]*min-height: var\(--tap\);/);
    expect(css).not.toMatch(/--console-tap/);
    expect((css.match(/min-height: var\(--tap\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const dense = css.slice(css.indexOf("[data-density='dense']"));
    expect(dense.slice(0, dense.indexOf('}'))).not.toContain('--tap:');

    // Measuring 13.3 caught a 36px column header, 34px saved-view halves and a search box
    // that dense lowered to 36px — all of which passed the count above. Every control the
    // list adds takes `--tap` by name, and never the field token dense lowers.
    for (const selector of ['.console-sort', '.console-chip-button', '.console-view-chip', '.console-chip-x', '.console-search', '.console-inline select', '.console-cards-head']) {
      const start = css.indexOf(`\n${selector} {`);
      expect(start, `${selector} is styled`).toBeGreaterThan(-1);
      expect(css.slice(start, css.indexOf('}', start)), selector).toMatch(/var\(--tap\)/);
    }
    expect(css).not.toMatch(/min-(?:height|inline-size|block-size): [12]\.[0-9]+rem/);
    expect((css.match(/min-height: var\(--tap-field\)/g) ?? []).length).toBe(1);
  });

  it('lets the drawer become visible in the frame it opens, not one later', () => {
    // A drawer that transitions `visibility` is still `hidden` a frame after it opens,
    // and focus cannot enter a hidden subtree — `ConsoleFrame` moves focus in the same
    // task as the click, so this rule is the difference between a working drawer and a
    // dead one. It used to be proved by the drawer carrying `!important` to outrank the
    // site's blanket `transition: all .3s !important` on `*`. BK-19.1 removed that
    // blanket rule, so the assertion is now the negative: it must not come back, and the
    // drawer must still name `transform` and nothing else.
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    // `[^;]` alone would also match across the lines of the comment that explains what
    // used to be here, so the pattern is anchored to one declaration.
    expect(globals).not.toMatch(/transition: all [^;\n]*!important/);
    // The replacement is a named list, so a state change cannot touch a layout property.
    expect(globals).toMatch(/transition:\s+color var\(--dur-base\) var\(--ease-out\),/);
    expect(globals).toMatch(/transform var\(--dur-base\) var\(--ease-out\),/);
    expect(css).toMatch(/\.console-side\s*\{[^}]*transition: transform var\(--dur-base\) var\(--ease-out\);/);
  });

  it('keeps one set of numbers behind both surfaces', () => {
    // The console and the site already read the same palette; what BK-19.1 added is the
    // part that does not travel with colour — the spacing scale, the two radii the
    // console drew by hand, elevation, hairlines and the named motion curves. They live
    // in one file. A token that changes with the theme is defined twice there on
    // purpose (`:root` and `html[data-theme="dark"]`); one that does not may be defined
    // once, and a screen that reaches for a raw number instead is the start of a second
    // system nobody maintains.
    for (const token of ['--sp-1', '--sp-4', '--sp-8', '--radius-control', '--radius-surface', '--radius-pill',
      '--z-sticky', '--z-scrim', '--z-drawer', '--z-drop', '--z-modal', '--z-palette', '--z-toast',
      '--dur-fast', '--dur-base', '--dur-slow', '--dur-reveal', '--ease-out', '--ease-in-out', '--ease-spring',
      // BK-19.3a: the control geometry both surfaces' buttons read, and the two durations
      // that are not transitions — a spinner and a skeleton sweep.
      '--tap', '--tap-field', '--ui-font', '--ui-font-small', '--ui-gap', '--ui-gap-tight', '--ui-pad', '--ui-stack',
      '--dur-spin', '--dur-shimmer']) {
      expect((globalsText.match(new RegExp(`\\n\\s*${token}:`, 'g')) ?? []).length, `${token} defined once`).toBe(1);
    }
    for (const token of ['--hairline', '--hairline-strong', '--hairline-gold', '--elev-1', '--elev-2', '--elev-3',
      '--glass-surface', '--glass-border', '--gold-gradient']) {
      expect((globalsText.match(new RegExp(`\\n\\s*${token}:`, 'g')) ?? []).length, `${token} light + dark`).toBe(2);
    }
    // Every one the console reads must be a token, not a literal it invented.
    expect(css).not.toMatch(/border-radius: 0\.(65|9)rem/);
    expect(css).not.toMatch(/transition: transform 0?\.\d+s/);
    expect(css).toMatch(/border: 1px solid var\(--hairline\)/);
    expect(css).toMatch(/box-shadow: var\(--elev-3\)/);
  });

  it('keeps the fallback palette and the painted palette in step', () => {
    // `globals.css` `:root` is the fallback; `siteTheme.light` is the inline style the
    // three document roots paint. A colour that disagrees between the two is a colour
    // that changes on whichever document forgets the style attribute — and the one that
    // can forget it is the error page, which is the worst place to discover a theme bug.
    const root = globalsText.slice(globalsText.indexOf(':root {'), globalsText.indexOf('@theme inline'));
    let compared = 0;
    for (const [name, value] of Object.entries(siteTheme.light as Record<string, string>)) {
      const at = root.indexOf(`\n  ${name}:`);
      if (at === -1) continue; // painted by the inline style only — no fallback to drift
      expect(root.slice(at).startsWith(`\n  ${name}: ${value};`), `${name} matches the fallback`).toBe(true);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it('decides density on the server, from the prefs', () => {
    expect(readFileSync(join(consoleDir, 'layout.tsx'), 'utf8')).toMatch(/data-density=\{prefs\.density\}/);
    for (const key of ['shell.screens', 'shell.close', 'shell.density.dense', 'shell.density.comfortable'] as MessageKey[]) {
      for (const locale of SITE_LOCALES) {
        expect(message(key, locale).length, `${key} ${locale}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the navigation reads off the grants (BK-13.2)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  const nav = readFileSync(join(process.cwd(), 'src/components/console/ConsoleNav.tsx'), 'utf8');
  const frame = readFileSync(join(process.cwd(), 'src/components/console/ConsoleFrame.tsx'), 'utf8');

  it('hides a screen the role cannot read and greys an entity it cannot write', () => {
    const grants: Grant[] = [
      { resource: 'article', action: 'read', scope: null },
      { resource: 'article', action: 'update', scope: { locales: ['ar'] } },
    ];
    const content = navTree(grants, 'en').find((group) => group.key === 'content');
    // Read on one resource only: the other three content screens are absent, not greyed.
    expect(content?.branches.map((branch) => branch.key)).toEqual(['articles']);

    const articles = content?.branches[0];
    expect(articles?.leaves.map((leaf) => [leaf.key, leaf.writable])).toEqual([
      ['ar', true],
      ['en', false],
    ]);
    // One writable entity is enough to make the screen itself writable, and a scoped
    // grant never matches an unscoped `can(…, {})` — that is why the branch asks its
    // leaves rather than the catalog.
    expect(articles?.writable).toBe(true);
  });

  it('shows a read-only role the whole structure, greyed', () => {
    const branches = navTree(grantsFor('SEO'), 'en').flatMap((group) => group.branches);
    const articles = branches.find((branch) => branch.key === 'articles');
    expect(articles?.leaves).toHaveLength(2);
    expect(articles?.writable).toBe(false);
    expect(articles?.leaves.every((leaf) => !leaf.writable)).toBe(true);
    // The SEO role has no `setting` read, so the Site group is not in the tree at all.
    expect(navTree(grantsFor('SEO'), 'en').map((group) => group.key)).not.toContain('site');
  });

  it('greys the navigation list even for the Owner, because the catalog scopes it out', () => {
    const lists = navTree(grantsFor('Editor'), 'ar')
      .flatMap((group) => group.branches)
      .find((branch) => branch.key === 'lists');
    expect(lists?.leaves.map((leaf) => [leaf.key, leaf.writable])).toEqual([
      ['nav', false],
      ['branches', true],
      ['specialists', true],
      ['treatments', true],
      ['services', true],
      ['faq', true],
      ['results', true],
    ]);
  });

  it('names the scope in every leaf URL, and keeps the strip flat', () => {
    const grants = grantsFor('Owner');
    const leaves = navTree(grants, 'ar').flatMap((group) => group.branches.flatMap((branch) => branch.leaves));
    expect(leaves).toHaveLength(3 * 2 + LIST_KEYS.length);
    for (const leaf of leaves) {
      expect(leaf.path).toMatch(/^\/console\/(articles|offers|pages)\?locale=(ar|en)$|^\/console\/lists\?list=[a-z_]+$/);
    }
    // The phone bar holds the screens, never the tree: a 640 px strip has no room for it.
    const strip = navStrip(grants, 'ar');
    expect(strip.map((branch) => branch.key)).toEqual(navTree(grants, 'ar').flatMap((group) => group.branches.map((branch) => branch.key)));
    expect(strip.every((branch) => branch.leaves.length === 0)).toBe(true);
  });

  it('lists both screens and entities for the palette, in the console language', () => {
    const places = palettePlaces(grantsFor('Editor'), 'ar');
    expect(places.map((place) => place.path)).toContain('/console/articles?locale=ar');
    expect(places.map((place) => place.path)).toContain('/console/lists?list=branches');
    expect(places.every((place) => place.label.length > 0 && place.group.length > 0)).toBe(true);
    // A place the role cannot write is in the list, marked, not missing — the palette is
    // also how someone finds the screen they can only read.
    expect(places.find((place) => place.path === '/console/lists?list=nav')?.writable).toBe(false);
  });

  it('labels every group and palette string in both languages', () => {
    const keys = [
      'nav.group.workspace',
      'nav.group.content',
      'nav.group.site',
      'nav.group.account',
      'nav.readonly',
      'palette.open',
      'palette.placeholder',
      'palette.screens',
      'palette.records',
      'palette.searching',
      'palette.empty',
      'palette.shortcut',
    ] as MessageKey[];
    for (const key of keys) {
      for (const locale of SITE_LOCALES) {
        expect(message(key, locale).length, `${key} ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it('folds with the browser, not with script', () => {
    // BK-5's rule: the console's chrome works with JavaScript switched off. The tree's
    // fold is a native `<details>` and the leaves are ordinary links.
    expect(nav).toContain('<details');
    expect(nav).not.toMatch(/useState/);
    expect(frame).toContain('<ConsolePalette');
    expect(css).toMatch(/\.console-nav-leaves/);
    expect(css).toMatch(/\.console-palette\s*\{/);
    // The greyed state is a cue, not a colour alone: the row keeps its own title text.
    expect(css).toMatch(/\[data-locked='true'\]/);
  });

  it('answers 401, 403 and 400 before it reads a single row', async () => {
    const anon = await searchHandler(request('/search?q=cold'));
    expect(anon.status).toBe(401);

    const { token } = await login(noReadEmail);
    const forbidden = await searchHandler(request('/search?q=cold', { cookie: `shamah_session=${token}` }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: 'forbidden', action: 'article+offer+page.read' });

    const owner = await login(ownerEmail);
    const short = await searchHandler(request('/search?q=c', { cookie: `shamah_session=${owner.token}` }));
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: 'invalid_input' });
  });

  it('answers with the row the palette can open, and writes no audit row for a read', async () => {
    const { token } = await login(ownerEmail);
    const res = await searchHandler(request(`/search?q=${searchKey}`, { cookie: `shamah_session=${token}` }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hits?: { kind: string; title: string; path: string }[] };
    expect(body.hits).toHaveLength(1);
    expect(body.hits?.[0]).toMatchObject({
      kind: 'article',
      title: 'دليل الليزر البارد',
      path: `/console/articles?key=${searchKey}`,
    });
    // The same term against a resource the row is not: the query is only built for the
    // kinds the caller holds `read` on, and never for the rest.
    expect(await searchRows(['page'], searchKey)).toEqual([]);
    expect(await searchRows([], searchKey)).toEqual([]);
    expect(await auditCount('article.read', ownerEmail)).toBe(0);
  });

  it('escapes what LIKE would otherwise treat as a wildcard', () => {
    expect(likeOf('a%c_d\\e')).toBe('%a\\%c\\_d\\\\e%');
    expect(likeOf('  cold  ')).toBe('%cold%');
  });
});

describe('the prefs route', () => {
  it('401s without a session and 403s without a CSRF header', async () => {
    const anon = await updatePrefsHandler(request('/prefs', { method: 'PATCH', body: JSON.stringify({ locale: 'en', theme: 'dark' }) }));
    expect(anon.status).toBe(401);

    const { token } = await login(ownerEmail);
    const noCsrf = await updatePrefsHandler(request('/prefs', { method: 'PATCH', cookie: `shamah_session=${token}`, body: JSON.stringify({ locale: 'en', theme: 'dark' }) }));
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()) as { error: string }).toMatchObject({ error: 'csrf_failed' });
  });

  it('400s on a locale the catalog does not have, and writes no audit row for it', async () => {
    const { token, csrf } = await login(ownerEmail);
    const bad = await updatePrefsHandler(
      request('/prefs', { method: 'PATCH', cookie: `shamah_session=${token}`, headers: { 'x-csrf-token': csrf }, body: JSON.stringify({ locale: 'fr', theme: 'dark' }) }),
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'invalid_input' });
    expect(await auditCount('self.update', ownerEmail)).toBe(0);
  });

  it('saves the two account choices and the device density, echoes them, and sets the cookie', async () => {
    const { token, csrf } = await login(ownerEmail);
    const res = await updatePrefsHandler(
      request('/prefs', {
        method: 'PATCH',
        cookie: `shamah_session=${token}`,
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ locale: 'en', theme: 'dark', density: 'dense' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prefs: { locale: 'en', theme: 'dark', density: 'dense' } });

    const prefs = cookieValue(setCookies(res), 'shamah_console_prefs');
    expect(prefs).toBe('en.dark.dense');
    expect(setCookies(res).find((line) => line.startsWith('shamah_console_prefs='))).toMatch(/Path=\//);

    const stored = await db.selectFrom('users').select(['locale', 'theme']).where('email_lc', '=', ownerEmail).executeTakeFirstOrThrow();
    expect(stored).toEqual({ locale: 'en', theme: 'dark' });

    // A Viewer owns nothing above their own row, and their own row is still theirs.
    const viewer = await login(viewerEmail);
    const theirs = await updatePrefsHandler(
      request('/prefs', {
        method: 'PATCH',
        cookie: `shamah_session=${viewer.token}`,
        headers: { 'x-csrf-token': viewer.csrf },
        body: JSON.stringify({ locale: 'ar', theme: 'light', density: 'comfortable' }),
      }),
    );
    expect(theirs.status).toBe(200);

    const rows = await auditCount('self.update', viewerEmail);
    expect(rows).toBe(1);
  });

  it('refuses a partial prefs body instead of resetting the term it does not mention', async () => {
    const { token, csrf } = await login(ownerEmail);
    const res = await updatePrefsHandler(
      request('/prefs', {
        method: 'PATCH',
        cookie: `shamah_session=${token}`,
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ locale: 'en', theme: 'light' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: { path: string }[] };
    expect(body.error).toBe('invalid_input');
    expect(body.issues?.map((issue) => issue.path)).toContain('density');
    expect(setCookies(res).join()).not.toContain('shamah_console_prefs=');
  });
});

async function auditCount(action: string, actorEmail: string): Promise<number> {
  const rows = await db
    .selectFrom('audit_log')
    .select('id')
    .where('action', '=', action)
    .where('actor_email', '=', actorEmail)
    .execute();
  return rows.length;
}

describe('the overview', () => {
  it('counts only the resources the caller may read', async () => {
    const owner = await loadGrants(userIds[0]);
    const viewer = await loadGrants(userIds[1]);

    const ownerRows = await overviewRows(owner.grants);
    const viewerRows = await overviewRows(viewer.grants);

    expect(ownerRows.map((row) => row.resource)).toEqual(['article', 'offer', 'page', 'list', 'media', 'lead', 'user']);
    // Viewer reads content and leads, but neither the media library nor the accounts.
    expect(viewerRows.map((row) => row.resource)).toEqual(['article', 'offer', 'page', 'list', 'lead']);
    for (const row of viewerRows) expect(Number.isSafeInteger(row.count)).toBe(true);
  });
});

describe('a screen only says saved when the server says saved', () => {
  // Found by clicking through the console against a database whose table was missing:
  // the handler died inside MariaDB, answered 500 with an empty body, and the list still
  // read "Filter saved." A body without an `error` code is therefore only a success when
  // the status is one.
  it('names the failure the body carries', () => {
    expect(callResult(409, { error: 'name_taken' })).toMatchObject({ status: 409, error: 'name_taken' });
    expect(callResult(200, { view: { id: 'v1' } }).error).toBe(null);
  });

  it('names it by status when the body has nothing', () => {
    for (const body of [null, {}, '<html>']) {
      const result = callResult<{ view?: unknown }>(500, body);
      expect(result.error, JSON.stringify(body)).toBe('http_500');
      expect(result.data).toBeNull();
    }
  });

  it('does not invent an error for a code the server did answer with', () => {
    expect(callResult(404, { error: 'not_found' }).error).toBe('not_found');
  });

  it('keeps the field messages a rejected write answers with', () => {
    // A 400 with `{ error, issues }` is the only way the editor knows which box to mark,
    // so `issues` has to survive the same trip `data` does.
    const rejected = callResult(400, { error: 'invalid_input', issues: [{ path: 'fields.title', message: 'required' }] });
    expect(rejected.issues).toEqual([{ path: 'fields.title', message: 'required' }]);
    expect(rejected.data).toBeNull();

    const accepted = callResult<{ row?: unknown }>(200, { row: { id: 'r1' }, issues: [] });
    expect(accepted.issues).toEqual([]);
    expect(accepted.data).toEqual({ row: { id: 'r1' } });
  });

  it('ignores an issues field that is not a list of messages', () => {
    expect(callResult(400, { error: 'invalid_input', issues: 'nope' }).issues).toEqual([]);
    expect(callResult(400, { error: 'invalid_input', issues: [{ path: 1, message: 'x' }] }).issues).toEqual([]);
  });
});

describe('the editor pane is one row, edited (BK-13.4)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  const editor = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');
  const workspace = readFileSync(join(process.cwd(), 'src/components/console/ContentWorkspace.tsx'), 'utf8');

  it('splits the pane on the pane’s own width', () => {
    // The workspace gives the editor 22rem or 60rem depending on the viewport, so a
    // viewport media query would put a phone-width preview next to a squeezed field.
    expect(css).toMatch(/\.console-work-edit\s*\{[^}]*container-name: console-edit/);
    expect(css).toMatch(/@container console-edit \(min-width: \d+rem\)/);
    expect(css).toMatch(/\.console-editor\s*\{[^}]*grid-template-columns/);
  });

  it('pins the save bar and keeps every control in it at the tap floor', () => {
    expect(css).toMatch(/\.console-editor-bar\s*\{[^}]*position: sticky/);
    const ui = readFileSync(join(process.cwd(), 'src/components/ui/ui.css'), 'utf8');
    // The bar still owns its own floor; the controls inside it are the primitive's, so
    // their floor is proved in the file that paints them (19.3a) and not re-declared here.
    expect(css.slice(css.indexOf('\n.console-editor-bar {'), css.indexOf('}', css.indexOf('\n.console-editor-bar {')))).toMatch(/var\(--tap\)/);
    expect(ui).toMatch(/\.ui-button\s*\{[^}]*min-height: var\(--tap\);/);
    expect(editor).toContain('<Button');
    expect(editor).not.toContain('console-button');
  });

  it('writes the draft on a pause and never publishes itself', () => {
    expect(editor).toMatch(/const AUTOSAVE_MS = \d{3,5};/);
    // The two things a person must be able to read off the bar: that it saves drafts only,
    // and that it stopped because someone else got there first.
    expect(editor).toContain("labels['content.autosave']");
    expect(editor).toContain("labels['content.autosave_stopped']");
    expect(editor).toMatch(/result\.error === 'stale_row'\) setAutosaveStopped\(true\)/);
    expect(editor).toMatch(/if \(!canEditRow \|\| !dirty[^)]*autosaveStopped/);
  });

  it('saves before it publishes, because publish means the draft in the database', () => {
    expect(editor).toMatch(/if \(dirty && !\(await save\('nav'\)\)\) return;/);
  });

  it('saves from the keyboard', () => {
    expect(editor).toMatch(/\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === 's'/);
    expect(editor).toContain('event.preventDefault()');
    expect(editor).toContain("labels['content.keyboard']");
  });

  it('holds a navigation that would lose unsaved words', () => {
    // The gate is in the workspace, the words are in the editor: picking a row, a tab or
    // the Trash all ask first, and only the pane that holds the form can answer.
    expect(workspace).toMatch(/if \(!dirty\) \{\s*\w+\(\);/);
    expect(workspace.match(/requestNav\(/g)!.length).toBeGreaterThanOrEqual(4);
    expect(editor).toContain("labels['content.unsaved.save']");
    expect(editor).toContain("labels['content.unsaved.discard']");
    expect(editor).toContain("labels['content.unsaved.keep']");
    // Discarding puts back exactly what the server last said, so the next save cannot
    // re-send what was just thrown away.
    expect(editor).toMatch(/setForm\(savedForm\);\s*setSavedForm\(savedForm\);/);
  });

  it('marks the field a message belongs to', () => {
    expect(editor).toContain('aria-invalid');
    expect(editor).toContain('data-invalid');
    expect(editor).toMatch(/className="console-field-error" role="alert"/);
    expect(css).toMatch(/\.console-field-error\s*\{[^}]*var\(--text-danger\)/);
  });

  it('leaves the row’s scope to the workspace', () => {
    // One owner per thing: the editor never touches the selection or the tabs, and the
    // workspace holds no form. `create()` is the one write the workspace makes, because a
    // new row is empty — there are no words in it for the editor to protect.
    expect(editor).not.toMatch(/setScope|setSelectedId/);
    expect(workspace).not.toMatch(/setForm|fieldsFromForm|formOf|RevisionView/);
    expect(workspace).not.toMatch(/'PATCH'|\/publish|\/restore|\/rollback|\/revisions/);
  });
});

describe('every screen reaches the primitives through one door (BK-13.5)', () => {
  /** Each page file with the path it sits at, so a failure names the screen that drifted. */
  const pageFiles = (dir: string): { path: string; source: string }[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return pageFiles(full);
      return entry === 'page.tsx' ? [{ path: full, source: readFileSync(full, 'utf8') }] : [];
    });
  const pages = pageFiles(consoleDir);
  const list = readFileSync(join(process.cwd(), 'src/components/console/ConsoleList.tsx'), 'utf8');

  it('draws a content screen from the workspace, never from a primitive', () => {
    expect(pages.length, 'the sweep covers every registered screen').toBe(CONSOLE_SCREENS.length + 1);
    // A screen that imported ConsoleList would hold a second copy of the terms the address
    // bar already names, and the two answer different questions after one reload. Matched on
    // the import, not the word: `ConsoleListsPage` is a screen that is drawn correctly.
    const primitive = /from '@\/components\/console\/(?:ConsoleList|ConsoleEditor|ContentWorkspace)'/;
    for (const { path, source } of pages) {
      expect(source, path).not.toMatch(primitive);
    }
    // Settings is the one screen that is not a content screen: a site setting takes effect
    // as it is saved, so it has no draft, no publish bar and nothing to share.
    expect(pages.find(({ path }) => path.endsWith(join('settings', 'page.tsx')))?.source).toMatch(/SettingsWorkspace/);
  });

  it('hands the whole query string over instead of naming terms', () => {
    // A page that picked out `?sort` and `?filter` for itself falls behind the list the
    // moment the list gains a term — the drift this row was written to close.
    for (const { path, source } of pages) {
      expect(source, path).not.toMatch(/parseListView|parseListScope|URLSearchParams/);
    }
  });

  it('keeps a list view out of the browser’s history', () => {
    // `replaceState`, on purpose: a chip press is not a page, so Back leaves the console
    // screen for the previous one, which the server renders from its own terms. A pushState
    // here would make the address bar and the screen two histories that disagree.
    expect(list).toMatch(/history\.replaceState/);
    expect(list).not.toMatch(/pushState|useRouter/);
  });
});
