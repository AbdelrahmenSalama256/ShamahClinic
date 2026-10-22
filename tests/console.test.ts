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
import { ROLE_SEEDS, SITE_LOCALES, permissionsFor, type RoleName } from '../src/lib/auth/roles';
import type { Grant } from '../src/lib/auth/permissions';
import { decideRoute, isConsolePath } from '../src/lib/site-routing';
import {
  DEFAULT_PREFS,
  decodePrefs,
  dirOf,
  encodePrefs,
  localeFromAcceptLanguage,
  resolvePrefs,
} from '../src/lib/console/prefs';
import { CONSOLE_SCREENS, visibleScreens } from '../src/lib/console/screens';
import { message, type MessageKey } from '../src/lib/console/messages';
import { overviewRows } from '../src/lib/console/overview';
import { updatePrefsHandler } from '../src/lib/console/prefs-route';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-console-2026';
const ownerEmail = `bk5-owner-${run}@example.invalid`;
const viewerEmail = `bk5-viewer-${run}@example.invalid`;

const userIds: string[] = [];
const roleIds: string[] = [];
let ownerId = '';
let viewerId = '';
let ipSeq = 0;

const consoleDir = join(process.cwd(), 'src/app/console');

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

  userIds.push(
    await createUser({ email: ownerEmail, password: PASSWORD, name: 'BK5 Owner' }),
    await createUser({ email: viewerEmail, password: PASSWORD, name: 'BK5 Viewer' }),
  );
  await assignRole(userIds[0], ownerId);
  await assignRole(userIds[1], viewerId);
});

afterAll(async () => {
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', [ownerEmail, viewerEmail]).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('role_permissions').where('role_id', 'in', roleIds).execute();
    await db.deleteFrom('roles').where('id', 'in', roleIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
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
    const grantsFor = (name: RoleName): Grant[] => {
      const seed = ROLE_SEEDS.find((role) => role.name === name);
      return seed ? permissionsFor(seed).map((row) => ({ ...row })) : [];
    };
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
    // Two `ConsoleNav`s, one of them the strip: CSS shows exactly one per width.
    expect(frame.match(/<ConsoleNav/g)).toHaveLength(2);
    expect(frame).toMatch(/<ConsoleNav[^>]*strip/);
  });

  it('holds the 44px tap floor at both densities', () => {
    expect(css).toMatch(/--console-tap: 2\.75rem/);
    expect((css.match(/min-height: var\(--console-tap\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    const dense = css.slice(css.indexOf("[data-density='dense']"));
    expect(dense.slice(0, dense.indexOf('}'))).not.toContain('--console-tap:');
  });

  it('lets the drawer become visible in the frame it opens, not one later', () => {
    // `globals.css` puts `transition: all .3s !important` on `*`, and `all` covers
    // `visibility`. A still-hidden drawer cannot hold focus, and `ConsoleFrame` moves
    // focus into it in the same task as the click, so the drawer has to win that
    // `!important`. Measured on the built console: without it, focus stayed on `body`.
    const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(globals).toMatch(/transition: all 0\.3s ease-in-out !important/);
    expect(css).toMatch(/\.console-side\s*\{[^}]*transition: transform 0\.18s ease !important/);
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
