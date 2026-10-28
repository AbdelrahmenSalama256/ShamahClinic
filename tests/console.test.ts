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
import { CONSOLE_SCREENS, navItems, palettePlaces, visibleScreens } from '../src/lib/console/screens';
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
let searchArticleId = '';

const userIds: string[] = [];
const roleIds: string[] = [];
let ownerId = '';
let viewerId = '';
let ipSeq = 0;

const consoleDir = join(process.cwd(), 'src/app/(console)/console');

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
  searchArticleId = created.value.id;
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
    expect(resolvePrefs({ acceptLanguage: 'en-US,en;q=0.9' })).toEqual({ locale: 'en', theme: 'light' });
    expect(resolvePrefs({ cookie: 'en.dark', acceptLanguage: 'ar' })).toEqual({ locale: 'en', theme: 'dark' });
    // The account wins: switching the console language must stick after signing in elsewhere.
    expect(resolvePrefs({ account: { locale: 'ar', theme: 'light' }, cookie: 'en.dark' })).toEqual({
      locale: 'ar',
      theme: 'light',
    });
    // A stored value the catalog no longer knows about falls through instead of crashing.
    expect(resolvePrefs({ account: { locale: 'fr', theme: 'neon' }, cookie: 'en.dark' })).toEqual({
      locale: 'en',
      theme: 'dark',
    });
  });

  it('reads a cookie written while the console still had a density, ignoring the third term', () => {
    expect(resolvePrefs({ account: { locale: 'ar', theme: 'light' }, cookie: 'ar.light.dense' })).toEqual({
      locale: 'ar',
      theme: 'light',
    });
    expect(resolvePrefs({ cookie: 'en.dark.comfy' })).toEqual({ locale: 'en', theme: 'dark' });
  });

  it('round-trips the cookie and refuses anything it does not recognise', () => {
    for (const locale of SITE_LOCALES) {
      for (const theme of ['light', 'dark'] as const) {
        expect(decodePrefs(encodePrefs({ locale, theme }))).toEqual({ locale, theme });
      }
    }
    expect(decodePrefs('')).toEqual({});
    expect(decodePrefs('de.bright')).toEqual({});
    expect(decodePrefs('en')).toEqual({ locale: 'en' });
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
    const registered = [...CONSOLE_SCREENS.map((screen) => screen.path), '/console/login', '/console/[kind]', '/console/[kind]/[id]'].sort();
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
    // The screens every role holds, plus what its `read` grants reach. Leads is a
    // workspace screen, so it comes before the content group; Marketer has no `list`
    // grant and only Owner/Admin can read `setting`, so those rows are the proof the
    // sidebar is filtered by the catalog rather than hardcoded.
    const content = ['articles', 'offers', 'pages'];
    const expected: Record<RoleName, string[]> = {
      Owner: ['overview', 'leads', ...content, 'lists', 'seo', 'tracking', 'roles', 'users', 'settings', 'password'],
      Admin: ['overview', 'leads', ...content, 'lists', 'seo', 'tracking', 'roles', 'users', 'settings', 'password'],
      Editor: ['overview', 'leads', ...content, 'lists', 'seo', 'password'],
      SEO: ['overview', ...content, 'lists', 'seo', 'password'],
      // The Marketer is the role the screen exists for: `integration` and nothing else.
      Marketer: ['overview', 'leads', ...content, 'seo', 'tracking', 'password'],
      Viewer: ['overview', 'leads', ...content, 'lists', 'seo', 'password'],
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

  it('reads only its own two sheets, never the site stylesheet or token layer', () => {
    // BK-19.1 kept the palette in `globals.css` and the console reached it through the
    // site's import. That is also how `img { width: 100% !important }` reached a 44px
    // thumbnail. Slice 0 went the rest of the way: the console declares its own `--c-*`
    // palette and kit, so its root names neither the site tokens nor the shared controls.
    const layout = readFileSync(join(consoleDir, 'layout.tsx'), 'utf8');
    expect(layout).toContain("import './console-kit.css';");
    expect(layout).toContain("import './console.css';");
    expect(layout).not.toContain('tokens.css');
    expect(layout).not.toContain('ui.css');
    expect(layout).not.toMatch(/import\s+['"][^'"]*globals\.css/);
    // The site keeps reading the shared token layer from its own root.
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(globals).toContain('@import "../styles/tokens.css";');
  });

  it('tells crawlers to stay out', () => {
    const layout = readFileSync(join(consoleDir, 'layout.tsx'), 'utf8');
    expect(layout).toMatch(/index:\s*false/);
    expect(layout).toMatch(/data-surface="console"/);
  });
});

describe('the shell reaches every screen at every width (BK-13.1)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  // BK-240: the tokens live in their own file now. The console imports it directly and
  // the site imports it from `globals.css`; reading them from the site stylesheet here
  // would have passed while proving nothing about the file the console actually reads.
  const tokensText = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
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
    // One flat list, rendered twice: the sidebar column (and the drawer that shares it)
    // and the phone strip. CSS shows exactly one per width.
    expect(frame).toContain('<ConsoleNav');
    expect((frame.match(/<ConsoleNav/g) ?? []).length).toBe(2);
    expect(frame).toContain('variant="strip"');
  });

  it('holds the 44px tap floor', () => {
    // The console owns its own floor: `--c-tap` is declared once in console.css and every
    // control the console paints reads it.
    expect(css).toMatch(/\n\s*--c-tap: 2\.75rem;/);
    expect(css).toMatch(/\n\s*--c-tap-field: 2\.75rem;/);
    expect(css).not.toMatch(/--console-tap/);
    expect((css.match(/min-(?:height|block-size): var\(--c-tap\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(css).not.toMatch(/data-density/);

    // Every control the list still paints itself takes `--c-tap` by name.
    for (const selector of ['.console-cards-head', '.console-editor-bar']) {
      const start = css.search(new RegExp(`\\n\\s*${selector.replace('.', '\\.')} \\{`));
      expect(start, `${selector} is styled`).toBeGreaterThan(-1);
      expect(css.slice(start, css.indexOf('}', start)), selector).toMatch(/var\(--c-tap\)/);
    }
    // The redesign deliberately draws compact list rows (36–40px) for a data screen; what
    // may not shrink is a control, and the kit proves that floor in its own file.

    // Nothing may still paint a field by hand. Anchored to the start of a line because
    // the comments in both files name the class they replaced — a rule is what must not
    // come back, and prose about the old one is the thing that keeps it from coming back.
    expect(css).not.toMatch(/^\s*\.console-field[ ,{]/m);
    for (const component of ['ConsoleEditor', 'ConsoleList', 'ConsolePalette', 'ContentListScreen', 'ContentDetail', 'LoginForm', 'PasswordForm', 'SettingsWorkspace']) {
      const source = readFileSync(join(process.cwd(), 'src/components/console', `${component}.tsx`), 'utf8');
      expect(source, `${component} has no raw field markup`).not.toMatch(/<(input|textarea|select)\s/);
    }
  });

  it('hangs no transition on a bare element', () => {
    // A `transition` written on `a, button, div` or `*` is not a style, it is an order to
    // every component: it outranks a named list, it moves layout properties a person is
    // reading, and it survives `prefers-reduced-motion` only until someone answers it with
    // `!important` — at which point the reduced-motion block loses too. The same four lines
    // came back in two sheets in one week, so the sweep is every sheet at once, and it reads
    // the selector rather than the value: the number is a taste, the selector is the defect.
    const sheets = [
      'src/app/(console)/console/console.css',
      'src/app/(console)/console/console-kit.css',
      'src/app/globals.css',
      'src/styles/tokens.css',
    ];
    for (const sheet of sheets) {
      const text = readFileSync(join(process.cwd(), ...sheet.split('/')), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(text, `${sheet} forces a transition`).not.toMatch(/transition:[^;]*!important/);
      for (const [, selector, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/transition\s*:/.test(body ?? '')) continue;
        // No class, attribute, id, pseudo-class, at-rule or universal: a bare element list.
        expect(/[.\[#@:*]/.test(selector ?? ''), `${sheet} transitions ${selector?.replace(/\s+/g, ' ').trim()}`).toBe(true);
      }
    }
    // What the console does keep is the scoped default in its own reset: a named list of the
    // properties that actually change, on the elements a finger hits.
    expect(css).toMatch(/:where\(a, button, input, select, textarea, summary\)/);
    expect(css).toMatch(/transition-property:/);
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
    expect(css).toMatch(/\.console-side\s*\{[^}]*transition: transform var\(--c-dur-slow\) var\(--c-ease-soft\);/);
  });

  it('keeps one set of numbers per surface', () => {
    // The site still keeps its non-colour system in one file: the spacing scale, the two
    // radii, elevation, hairlines and named motion curves. A token that changes with the
    // theme is defined twice there on purpose (`:root` and `html[data-theme="dark"]`);
    // one that does not may be defined once.
    for (const token of ['--sp-1', '--sp-4', '--sp-8', '--radius-control', '--radius-surface', '--radius-pill',
      '--z-sticky', '--z-scrim', '--z-drawer', '--z-drop', '--z-modal', '--z-palette', '--z-toast',
      '--dur-fast', '--dur-base', '--dur-slow', '--dur-reveal', '--ease-out', '--ease-in-out', '--ease-spring',
      '--tap', '--tap-field', '--ui-font', '--ui-font-small', '--ui-gap', '--ui-gap-tight', '--ui-pad', '--ui-stack',
      '--dur-spin', '--dur-shimmer']) {
      expect((tokensText.match(new RegExp(`\\n\\s*${token}:`, 'g')) ?? []).length, `${token} defined once`).toBe(1);
    }
    for (const token of ['--hairline', '--hairline-strong', '--hairline-gold', '--elev-1', '--elev-2', '--elev-3',
      '--glass-surface', '--glass-border', '--gold-gradient']) {
      expect((tokensText.match(new RegExp(`\\n\\s*${token}:`, 'g')) ?? []).length, `${token} light + dark`).toBe(2);
    }

    // The console has its own set, declared entirely in its own file: no `var()` it reads
    // is undefined, and no name it reads belongs to the site. That is what lets the two
    // stylesheets load into separate pages without either one waiting on the other.
    for (const token of ['--c-tap', '--c-tap-field', '--c-font', '--c-font-mono',
      '--c-text', '--c-text-2', '--c-text-3', '--c-surface', '--c-line', '--c-accent',
      '--c-gap', '--c-stack', '--c-r-md', '--c-z-sticky', '--c-z-drawer', '--c-dur-base',
      '--c-ease-soft']) {
      expect((css.match(new RegExp(`\\n\\s*${token}:`, 'g')) ?? []).length, `${token} is console-owned`).toBeGreaterThanOrEqual(1);
    }
    const defined = new Set([...css.matchAll(/(?:^|[;{])\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]));
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]!);
    // `--font-tajawal` is the one name the console reads without declaring: `next/font`
    // writes it on the root from `tajawal.variable`, and `--c-font` names it first in its
    // stack. Everything else has to be a `--c-*` token declared here.
    const fontVariable = '--font-tajawal';
    expect(used.filter((token) => token !== fontVariable && !defined.has(token)), 'every var() in console.css is declared there').toEqual([]);
    expect(used.filter((token) => token !== fontVariable && !token.startsWith('--c-')), 'console.css reads no site token').toEqual([]);

    // Every one the console draws with must be a token, not a literal it invented.
    expect(css).not.toMatch(/border-radius: 0\.(65|9)rem/);
    expect(css).not.toMatch(/transition: transform 0?\.\d+s/);
    expect(css).toMatch(/border-block-end: 1px solid var\(--c-line\)/);
    expect(css).toMatch(/box-shadow: var\(--c-ring\), var\(--c-lift\)/);
  });

  it('keeps the fallback palette and the painted palette in step', () => {
    // The token layer's `:root` is the fallback; `siteTheme.light` is the inline style the
    // three document roots paint. A colour that disagrees between the two is a colour
    // that changes on whichever document forgets the style attribute — and the one that
    // can forget it is the error page, which is the worst place to discover a theme bug.
    const root = tokensText.slice(tokensText.indexOf('\n:root {'), tokensText.indexOf('\nhtml[data-theme="dark"] {'));
    let compared = 0;
    for (const [name, value] of Object.entries(siteTheme.light as Record<string, string>)) {
      const at = root.indexOf(`\n  ${name}:`);
      if (at === -1) continue; // painted by the inline style only — no fallback to drift
      expect(root.slice(at).startsWith(`\n  ${name}: ${value};`), `${name} matches the fallback`).toBe(true);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(30);
  });

  it('draws the header as three tools, with no density switch (S5)', () => {
    // One comfortable rhythm: the root carries `data-theme` and no `data-density`, and
    // no catalog key survives for a layout choice that no longer exists.
    expect(readFileSync(join(consoleDir, 'layout.tsx'), 'utf8')).not.toMatch(/data-density/);
    expect(readFileSync(join(process.cwd(), 'src/lib/console/messages.ts'), 'utf8')).not.toMatch(/shell\.density/);
    // The one place the word survives is the note that an old cookie's third term is
    // ignored; no type, field or resolver may remain.
    expect(readFileSync(join(process.cwd(), 'src/lib/console/prefs.ts'), 'utf8')).not.toMatch(/ConsoleDensity|densityOf|density\s*[:?]/);

    const controls = readFileSync(join(process.cwd(), 'src/components/console/ConsoleControls.tsx'), 'utf8');
    const palette = readFileSync(join(process.cwd(), 'src/components/console/ConsolePalette.tsx'), 'utf8');
    // Two preference buttons here plus the palette's trigger: search, theme, language.
    // The view-site link is not a fourth tool; it lives with the account in the drawer.
    expect((controls.match(/<Button\b/g) ?? []).length).toBe(2);
    expect(controls).toMatch(/className="console-tool"/);
    expect(palette).toMatch(/className="console-tool"/);
    expect(css).toMatch(/\.console-account-site\s*\{/);

    // One shape for all three: a `--c-tap` square from this sheet, one skin from the kit.
    const tool = css.slice(css.indexOf('.console-tool {'));
    const rule = tool.slice(0, tool.indexOf('}'));
    expect(rule).toMatch(/inline-size: var\(--c-tap\)/);
    expect(rule).toMatch(/block-size: var\(--c-tap\)/);
    expect(rule, 'the tool paints no radius of its own').not.toMatch(/border-radius|background|border:/);
    const kit = readFileSync(join(consoleDir, 'console-kit.css'), 'utf8');
    expect(kit).toMatch(/border-radius: var\(--c-r-md\)/);
    expect(css).toMatch(/\.console-tool svg\s*\{[^}]*stroke-width: 1\.75;/);

    for (const key of ['shell.screens', 'shell.close', 'shell.view_site', 'shell.theme.light', 'shell.theme.dark', 'shell.locale.switch'] as MessageKey[]) {
      for (const locale of SITE_LOCALES) {
        expect(message(key, locale).length, `${key} ${locale}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the navigation reads off the grants (BK-13.2, S3)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  const nav = readFileSync(join(process.cwd(), 'src/components/console/ConsoleNav.tsx'), 'utf8');
  const frame = readFileSync(join(process.cwd(), 'src/components/console/ConsoleFrame.tsx'), 'utf8');
  const shell = readFileSync(join(process.cwd(), 'src/components/console/ConsoleShell.tsx'), 'utf8');
  const palette = readFileSync(join(process.cwd(), 'src/components/console/ConsolePalette.tsx'), 'utf8');

  it('hides a screen the role cannot read and greys a screen it cannot write', () => {
    const grants: Grant[] = [
      { resource: 'article', action: 'read', scope: null },
      { resource: 'article', action: 'update', scope: { locales: ['ar'] } },
    ];
    const items = navItems(grants, 'en');
    // Read on one content resource only: the other three screen rows are absent, not greyed.
    expect(items.filter((item) => ['articles', 'offers', 'pages'].includes(item.key)).map((item) => item.key)).toEqual(['articles']);

    // One writable locale is enough to make the screen row writable, and a scoped grant
    // never matches an unscoped `can(…, {})` — that is why the row asks its locales.
    expect(items.find((item) => item.key === 'articles')?.writable).toBe(true);
  });

  it('shows a read-only role the whole structure, greyed', () => {
    const items = navItems(grantsFor('SEO'), 'en');
    expect(items.find((item) => item.key === 'articles')?.writable).toBe(false);
    for (const listKey of LIST_KEYS) {
      expect(items.find((item) => item.key === listKey)?.writable, listKey).toBe(false);
    }
    // The SEO role holds no `setting`, `user` or `role` read, so those rows never exist.
    for (const key of ['settings', 'users', 'roles']) {
      expect(items.some((item) => item.key === key), key).toBe(false);
    }
  });

  it('greys the navigation list even for the Editor, because the catalog scopes it out', () => {
    const items = navItems(grantsFor('Editor'), 'ar');
    expect(items.find((item) => item.key === 'nav')?.writable).toBe(false);
    for (const listKey of LIST_KEYS.filter((key) => key !== 'nav')) {
      expect(items.find((item) => item.key === listKey)?.writable, listKey).toBe(true);
    }
  });

  it('draws one flat row per destination, in the owner’s order', () => {
    const items = navItems(grantsFor('Owner'), 'ar');
    expect(items.map((item) => item.key)).toEqual([
      'overview',
      'leads',
      'articles',
      'offers',
      'pages',
      ...LIST_KEYS,
      'seo',
      'tracking',
      'roles',
      'users',
      'settings',
      'password',
    ]);
    // No duplicate address, and no empty row: each named list is its own section.
    expect(new Set(items.map((item) => item.path)).size).toBe(items.length);
    for (const item of items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.path).toMatch(/^\/console(?:\/[a-z]+)?$/);
    }
    expect(items.find((item) => item.key === 'articles')?.path).toBe('/console/articles');
    expect(items.find((item) => item.key === 'services')?.path).toBe('/console/services');
  });

  it('uses the same flat list for the phone strip and the palette', () => {
    // Both are the sidebar, not a second navigation: one list decides what a section is
    // called and where it lives, at every width and in both search boxes.
    expect(shell).toMatch(/const items = navItems\(user\.grants, prefs\.locale\)/);
    expect(frame).toMatch(/<ConsoleNav items=\{items\} labels=\{navLabels\} variant="strip" \/>/);
    expect(frame).toMatch(/<ConsoleNav items=\{items\} labels=\{navLabels\} \/>/);
    expect(frame).toMatch(/<ConsolePalette entries=\{places\}/);
    expect(palette).not.toMatch(/entry\.group/);
  });

  it('lists the flat sections for the palette, in the console language', () => {
    const places = palettePlaces(grantsFor('Editor'), 'ar');
    expect(places.map((place) => place.path)).toContain('/console/articles');
    expect(places.map((place) => place.path)).toContain('/console/branches');
    expect(places.every((place) => place.label.length > 0)).toBe(true);
    // A place the role cannot write is in the list, marked, not missing — the palette is
    // also how someone finds the screen they can only read.
    expect(places.find((place) => place.path === '/console/nav')?.writable).toBe(false);
  });

  it('labels every screen and palette string in both languages', () => {
    const keys = [
      'nav.readonly',
      'shell.sign_out',
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

  it('is one flat list of links, with no fold and no tree', () => {
    // S3 removed the group → screen → entity tree. A `<details>` here would be the fold
    // coming back; the carets, leaves and group headings would be its clothes.
    expect(nav).not.toMatch(/<details|<summary|console-nav-caret|console-nav-leaves|console-nav-group|console-nav-heading/);
    expect(nav).toMatch(/className="console-nav-link"/);
    expect(nav).toMatch(/data-locked=\{item\.writable \? undefined : 'true'\}/);
    expect(frame).toContain('<ConsolePalette');
    expect(css).toMatch(/\.console-palette\s*\{/);
    // The greyed state is a cue, not a colour alone: the row keeps its own title text.
    expect(css).toMatch(/\[data-locked=['"]true['"]\]/);
  });

  it('signs out with a request, not a link a prefetch could fire', () => {
    expect(nav).toMatch(/consoleCall\('\/api\/console\/auth', 'DELETE'\)/);
    expect(nav).toMatch(/className="console-nav-link console-nav-signout"/);
    // The old header control is gone: one sign-out row, at the end of the navigation.
    expect(readFileSync(join(process.cwd(), 'src/components/console/ConsoleControls.tsx'), 'utf8')).not.toMatch(/signOut/);
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
      // The palette opens the row's own page (240), not the list it was found in: a
      // document is a place, and the URL has to survive a paste.
      path: `/console/articles/${searchArticleId}`,
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

describe('a section opens its entity with every field editable (S3)', () => {
  const detail = readFileSync(join(process.cwd(), 'src/components/console/ContentDetail.tsx'), 'utf8');
  const editor = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');

  it('shows the slug without ever making it a form value', () => {
    // The identity came from the first save's title and is what the site's URL means;
    // changing it in place would break links. It is printed beside the heading only.
    expect(detail).toMatch(/className="console-detail-key">\{row\.key\}/);
    expect(editor).toMatch(/Object\.entries\(row\.fields\)/);
    expect(editor).not.toMatch(/onChange\([^)]*row\.key/);
  });

  it('gives every picture a picker and a body the rich editor', () => {
    expect(editor).toMatch(/<ImagePicker/);
    expect(editor).toMatch(/<ImageGallery/);
    expect(editor).toMatch(/<RichEditor/);
    expect(editor).toMatch(/field\.kind === 'json'/);
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

  it('saves both account choices, echoes them, and sets the cookie', async () => {
    const { token, csrf } = await login(ownerEmail);
    const res = await updatePrefsHandler(
      request('/prefs', {
        method: 'PATCH',
        cookie: `shamah_session=${token}`,
        headers: { 'x-csrf-token': csrf },
        body: JSON.stringify({ locale: 'en', theme: 'dark' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prefs: { locale: 'en', theme: 'dark' } });

    const prefs = cookieValue(setCookies(res), 'shamah_console_prefs');
    expect(prefs).toBe('en.dark');
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
        body: JSON.stringify({ locale: 'ar', theme: 'light' }),
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
        body: JSON.stringify({ locale: 'en' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues?: { path: string }[] };
    expect(body.error).toBe('invalid_input');
    expect(body.issues?.map((issue) => issue.path)).toContain('theme');
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

describe('one row on its own page (BK-13.4, 240)', () => {
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');
  const editor = readFileSync(join(process.cwd(), 'src/components/console/ConsoleEditor.tsx'), 'utf8');
  const detail = readFileSync(join(process.cwd(), 'src/components/console/ContentDetail.tsx'), 'utf8');
  const listScreen = readFileSync(join(process.cwd(), 'src/components/console/ContentListScreen.tsx'), 'utf8');

  it('gives the list the whole width, and a row its own address', () => {
    // The editor used to be a column beside the list, so the list got 75% of the page and
    // a phone got neither half. A row is a document: opening it is navigation.
    expect(css).toMatch(/\.console-work\s*\{[^}]*display: block;/);
    expect(css).not.toMatch(/\.console-work\s*\{[^}]*grid-template-columns/);
    expect(css).not.toMatch(/\.console-work-edit/);
    // The old split named the editor's width from a viewport query; nothing may bring it
    // back, because the editor now lives on a page the viewport does not describe.
    expect(css).not.toMatch(/@media[^{]*\{\s*\.console-work/);
    expect(listScreen).not.toMatch(/ContentWorkspace|setSelectedId/);
    expect(listScreen).toMatch(/router\.push\(`\$\{contentDetailPath\(kind, created\.id, named \? scopeValue : null\)\}/);
    // The server renders the row before the editor mounts, so the first paint is the row
    // the URL names — not an empty pane that fetches it.
    expect(detail).toMatch(/initialRow=\{row\}/);
  });

  it('splits the pane on the pane’s own width', () => {
    // The detail page is the container: a phone stacks the preview under the form and a
    // laptop puts them side by side without either one guessing from the viewport.
    expect(css).toMatch(/\.console-detail\s*\{[^}]*container-name: console-edit/);
    expect(css).toMatch(/@container console-edit \(min-width: \d+rem\)/);
    expect(css).toMatch(/\.console-editor\s*\{[^}]*grid-template-columns/);
  });

  it('pins the save bar and keeps every control in it at the tap floor', () => {
    expect(css).toMatch(/\.console-editor-bar\s*\{[^}]*position: sticky/);
    const ui = readFileSync(join(process.cwd(), 'src/components/ui/ui.css'), 'utf8');
    // The bar still owns its own floor; the controls inside it are the primitive's, so
    // their floor is proved in the file that paints them (19.3a) and not re-declared here.
    expect(css.slice(css.indexOf('.console-editor-bar {'), css.indexOf('}', css.indexOf('.console-editor-bar {')))).toMatch(/var\(--c-tap\)/);
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
    // The gate is on the detail page, the words are in the editor: going back, switching
    // language and Escape all ask first, and only the pane that holds the form can answer.
    // A closed tab has no panel, so the browser's own prompt is the last resort.
    expect(detail).toMatch(/if \(!dirty\) \{\s*run\(\);\s*return;\s*\}/);
    expect((detail.match(/requestNav\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(detail).toContain("addEventListener('beforeunload', warn)");
    expect(editor).toContain("labels['content.unsaved.save']");
    expect(editor).toContain("labels['content.unsaved.discard']");
    expect(editor).toContain("labels['content.unsaved.keep']");
    // Discarding puts back exactly what the server last said, so the next save cannot
    // re-send what was just thrown away.
    expect(editor).toMatch(/setForm\(savedForm\);\s*setSavedForm\(savedForm\);/);
  });

  it('marks the field a message belongs to', () => {
    // Which box a message lands on is the console's decision; how the box looks when it
    // is wrong is the primitive's, and `ui-primitives.test.ts` proves that. What is
    // proved here is the routing: the server's `issues` reach the field they name, and
    // the console stops hand-painting the second a shared control takes over.
    expect(editor).toMatch(/errors=\{issues\.byField\[name\] \?\? \[\]\}/);
    expect(editor).toMatch(/aria-invalid=\{invalid \|\| undefined\}/);
    expect(editor).toMatch(/<Field\s+htmlFor=\{id\}/);
    // The field's paint belongs to the console kit: the editor writes no raw control, and
    // the only `.console-field` it names is the wrapper around a flag, whose target is the
    // kit's own checkbox label.
    expect(editor).not.toMatch(/<(input|textarea|select)\s/);
    expect(editor).not.toMatch(/className="console-control"/);
  });

  it('edits one language at a time, from tabs instead of a dropdown', () => {
    // The old editor put the language in a `Select`, so the language a write would name
    // was hidden behind a control. Both the list and the row now show two always-visible
    // tabs, and the row's editor changes the content of the one the tab names.
    expect(detail).toMatch(/const LANGUAGE_TABS: ContentLocale\[\] = \['ar', 'en'\];/);
    expect(detail).toMatch(/<Tabs/);
    expect(detail).not.toMatch(/<Select/);
    expect(listScreen).toMatch(/<Tabs/);
    expect(listScreen).not.toMatch(/<Select/);
    // The locale term is spelled by `writeScopeQuery`, not assembled here: one rule, one
    // place, so a request cannot name a language the guard does not read.
    expect(detail).not.toMatch(/locale=\$\{/);
  });

  it('leaves the row’s scope to the page', () => {
    // One owner per thing: the editor never touches the selection or the tabs, and the
    // detail page holds no form. Creating is the one write the list makes, because a new
    // row is empty — there are no words in it for the editor to protect.
    expect(editor).not.toMatch(/setScope|setSelectedId/);
    expect(detail).not.toMatch(/setForm|fieldsFromForm|formOf|RevisionView/);
    expect(detail).not.toMatch(/'PATCH'|\/publish|\/restore|\/rollback|\/revisions/);
  });

  it('shows the pictures the row itself carries', () => {
    // Offers, services and result stories carry images inside JSON that a form renders
    // as separate fields; the editor reads the live form so a newly typed URL appears
    // without a save. URLs are arbitrary — WordPress paths, CDNs, data URLs — which is
    // why the strip uses a plain `img` rather than a build-time allowlist.
    // `shown`, not `form`: the strip prints the copy the column will hold, so a value
    // still carrying its pasted markup does not become a broken `img src`.
    expect(editor).toContain("labels['content.media']");
    expect(editor).toMatch(/imagesOfForm\(row, shown\)/);
    expect(editor).toMatch(/<ul className="console-media-list">/);
    expect(css).toMatch(/console-media-list img/);
    expect(css).toMatch(/\.console-media-list img\s*\{[^}]*object-fit: cover;/);
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
    // Every registered screen, the login screen, the section page and the row page the
    // screens share (240, S2) — all four are real pages, so all four are in the sweep.
    expect(pages.length, 'the sweep covers every registered screen').toBe(CONSOLE_SCREENS.length + 3);
    // A screen that imported ConsoleList would hold a second copy of the terms the address
    // bar already names, and the two answer different questions after one reload. Matched on
    // the import, not the word: `ConsoleListsPage` is a screen that is drawn correctly.
    const primitive = /from '@\/components\/console\/(?:ConsoleList|ConsoleEditor|ContentDetail)'/;
    for (const { path, source } of pages) {
      expect(source, path).not.toMatch(primitive);
    }
    // Settings is the one screen that is not a content screen: a site setting takes effect
    // as it is saved, so it has no draft, no publish bar and nothing to share.
    expect(pages.find(({ path }) => path.endsWith(join('settings', 'page.tsx')))?.source).toMatch(/SettingsWorkspace/);
  });

  it('hands the whole query string over instead of naming terms', () => {
    // A page that picked out `?sort` and `?filter` for itself falls behind the list the
    // moment the list gains a term — the drift this row was written to close. The old
    // aggregate list is the one exception: it is a redirect that moves every term to the
    // section the path now names, and it parses nothing but `list` itself.
    for (const { path, source } of pages) {
      if (path.endsWith(join('lists', 'page.tsx'))) continue;
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

describe('the settings screen is catalog words, not literals (S1)', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/console/SettingsWorkspace.tsx'), 'utf8');
  const css = readFileSync(join(consoleDir, 'console.css'), 'utf8');

  it('names every word it shows through the catalog', () => {
    for (const key of ['settings.unsaved', 'settings.read_only', 'settings.banners.default', 'settings.banners.reset'] as const) {
      expect(message(key, 'ar'), key).toBeTruthy();
      expect(message(key, 'en'), key).toBeTruthy();
      expect(message(key, 'ar'), `${key} is translated`).not.toBe(message(key, 'en'));
    }
    // These two were constants in English; the badge and the reset button were bare text.
    expect(source).not.toContain('Unsaved changes');
    expect(source).not.toContain('Read only');
    expect(source).toMatch(/labels\["settings\.unsaved"\]/);
    expect(source).toMatch(/labels\["settings\.read_only"\]/);
    expect(source).toMatch(/labels\["settings\.banners\.default"\]/);
    expect(source).toMatch(/labels\["settings\.banners\.reset"\]/);
  });

  it('writes no bare text into the screen', () => {
    // A JSX text child is the shape a literal takes; every word here is a catalog value
    // or a data value the server fetched.
    expect(source).not.toMatch(/>\s*[A-Za-z][^<>{}]*</);
  });

  it('paints every settings class the screen writes', () => {
    // S0 took the owner's settings rules as the source of truth, and the rewrite names
    // more classes than it styles. A class with no rule is a card with no tone.
    const classes = new Set(
      [...source.matchAll(/className="([^"]*)"/g)]
        .flatMap((match) => match[1]!.split(/\s+/))
        .filter((name) => name.startsWith('settings-')),
    );
    expect(classes.size).toBeGreaterThan(20);
    for (const name of classes) {
      expect(css, `${name} is styled`).toMatch(new RegExp(`\.${name}(?![a-z0-9-])`));
    }
  });
});

describe('every named list is its own section (S2)', () => {
  const listsPage = readFileSync(join(consoleDir, '(workspace)/lists/page.tsx'), 'utf8');
  const sectionPage = readFileSync(join(consoleDir, '(workspace)/[kind]/page.tsx'), 'utf8');
  const detailPage = readFileSync(join(consoleDir, '(workspace)/[kind]/[id]/page.tsx'), 'utf8');
  const listScreen = readFileSync(join(process.cwd(), 'src/components/console/ContentListScreen.tsx'), 'utf8');

  it('turns the old aggregate list into a redirect that keeps the view', () => {
    // The page is not a screen any more; it answers with the section that replaced it and
    // leaves the query (trash, filter, page) for the section to read.
    expect(listsPage).not.toMatch(/ContentScreen/);
    expect(listsPage).toMatch(/redirect\(/);
    expect(listsPage).toMatch(/knownListKeys/);
    expect(listsPage).toMatch(/key !== 'list'/);
  });

  it('renders one list per section and offers no list tabs', () => {
    expect(sectionPage).toMatch(/knownListKeys/);
    expect(sectionPage).toMatch(/listKey=\{kind\}/);
    expect(listScreen).toMatch(/const tabs = named\s*\? \[\]/);
  });

  it('sends the old per-item address to the item’s own section', () => {
    expect(detailPage).toMatch(/segment === 'lists'/);
    expect(detailPage).toMatch(/listKeyOfItem/);
    expect(detailPage).toMatch(/contentDetailPath\('list_item', id, listKey\)/);
  });
});
