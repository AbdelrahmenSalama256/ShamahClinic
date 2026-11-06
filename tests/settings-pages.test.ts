/**
 * BK-15a: hiding a page and editing the site's own words.
 *
 * The pure half is here because the same parse runs on a value MariaDB may hand back
 * parsed or as LONGTEXT, and a redirect target is the one value that can send a visitor
 * somewhere else. The database half writes the real `pages` and `seo` groups — a reader
 * that only understood a test-shaped group would prove nothing — and deletes exactly the
 * keys it wrote.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const signals = vi.hoisted(() => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    signals.notFound();
    throw new Error('signal: not-found');
  },
  redirect: (href: string) => {
    signals.redirect(href);
    throw new Error('signal: redirect');
  },
}));

import { db, destroyDb } from '../src/lib/db';
import { guardPage } from '../src/lib/content/guard-page';
import { assertTestDb } from '../src/lib/db/guard';
import {
  defaultPageStates,
  hiddenPageHrefs,
  parsePageState,
  readPageStates,
} from '../src/lib/content/page-visibility';
import { getSiteMeta } from '../src/lib/content/site';
import { SEO_SETTING_GROUP, SITE_PAGES, safeRedirect } from '../src/lib/content/settings-catalog';

const SEO_KEYS = ['title.ar', 'title.en', 'description.ar', 'description.en', 'verification.google'];

async function purge(): Promise<void> {
  await db.deleteFrom('settings').where('group_name', '=', 'pages').execute();
  await db.deleteFrom('settings').where('group_name', '=', SEO_SETTING_GROUP).where('setting_key', 'in', SEO_KEYS).execute();
}

beforeAll(async () => {
  assertTestDb();
  await purge();
});

afterAll(async () => {
  await purge();
  await destroyDb();
});

describe('a saved page state', () => {
  it('understands the shapes a settings row may arrive in', () => {
    expect(parsePageState(undefined)).toEqual({ enabled: true, redirectTo: null });
    expect(parsePageState(true)).toEqual({ enabled: true, redirectTo: null });
    expect(parsePageState(false)).toEqual({ enabled: false, redirectTo: null });
    expect(parsePageState('false')).toEqual({ enabled: false, redirectTo: null });
    expect(parsePageState({ enabled: false, redirectTo: '/offers' })).toEqual({ enabled: false, redirectTo: '/offers' });
    expect(parsePageState('{"enabled":false,"redirectTo":"/contact"}')).toEqual({ enabled: false, redirectTo: '/contact' });
    // MariaDB prints JSON as LONGTEXT: the same document with a leading space is still one.
    expect(parsePageState('  {"enabled":false} ')).toEqual({ enabled: false, redirectTo: null });
  });

  it('fails open: an unreadable row leaves the page visible', () => {
    expect(parsePageState('not json')).toEqual({ enabled: true, redirectTo: null });
    expect(parsePageState([1, 2])).toEqual({ enabled: true, redirectTo: null });
    expect(parsePageState({ enabled: 'maybe' })).toEqual({ enabled: true, redirectTo: null });
  });

  it('only keeps a redirect target the server may follow', () => {
    expect(safeRedirect('/offers')).toBe('/offers');
    expect(safeRedirect(' https://example.com/sale ')).toBe('https://example.com/sale');
    expect(safeRedirect('')).toBeNull();
    expect(safeRedirect('offers')).toBeNull();
    // Protocol-relative leaves the site with no scheme to name it.
    expect(safeRedirect('//evil.example')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
    expect(parsePageState({ enabled: false, redirectTo: 'javascript:alert(1)' })).toEqual({ enabled: false, redirectTo: null });
  });

  it('defaults every registered page to visible and lists the hrefs hiding must remove', () => {
    const states = defaultPageStates();
    expect(SITE_PAGES.every((page) => states[page.key].enabled)).toBe(true);
    expect(hiddenPageHrefs(states)).toEqual([]);

    states.about.enabled = false;
    states.privacy.enabled = false;
    expect(hiddenPageHrefs(states)).toEqual(['/about', '/privacy']);
  });
});

describe('the pages group read from the database', () => {
  it('overrides only the pages it names and ignores a key the site does not render', async () => {
    await db
      .insertInto('settings')
      .values([
        { group_name: 'pages', setting_key: 'blogs', value: JSON.stringify({ enabled: false, redirectTo: '/offers' }), default_value: null, is_secret: 0, version: 1 },
        { group_name: 'pages', setting_key: 'cart', value: JSON.stringify({ enabled: false }), default_value: null, is_secret: 0, version: 1 },
      ])
      .execute();

    const states = await readPageStates();
    expect(states.blogs).toEqual({ enabled: false, redirectTo: '/offers' });
    expect(states.about.enabled).toBe(true);
    expect(states).not.toHaveProperty('cart');
    expect(hiddenPageHrefs(states)).toEqual(['/blogs']);

    await db.deleteFrom('settings').where('group_name', '=', 'pages').execute();
    expect(hiddenPageHrefs(await readPageStates())).toEqual([]);
  });

  it('makes a hidden page 404, or follow a saved target, without touching a visible one', async () => {
    signals.notFound.mockClear();
    signals.redirect.mockClear();
    await db
      .insertInto('settings')
      .values({
        group_name: 'pages',
        setting_key: 'faq',
        value: JSON.stringify({ enabled: false, redirectTo: null }),
        default_value: null,
        is_secret: 0,
        version: 1,
      })
      .execute();

    await expect(guardPage('faq')).rejects.toThrow('signal: not-found');
    expect(signals.notFound).toHaveBeenCalledTimes(1);

    await db
      .updateTable('settings')
      .set({ value: JSON.stringify({ enabled: false, redirectTo: '/offers' }) })
      .where('group_name', '=', 'pages')
      .where('setting_key', '=', 'faq')
      .execute();
    await expect(guardPage('faq')).rejects.toThrow('signal: redirect');
    expect(signals.redirect).toHaveBeenCalledWith('/offers');

    await expect(guardPage('about')).resolves.toBeUndefined();
    expect(signals.notFound).toHaveBeenCalledTimes(1);
    expect(signals.redirect).toHaveBeenCalledTimes(1);

    await db.deleteFrom('settings').where('group_name', '=', 'pages').execute();
  });
});

describe('the seo group read by the layout', () => {
  it('answers with the words the console saved, and with nothing beside them', async () => {
    // `docs/inventory.md` puts the metadata with the rest of the site's words: the CMS
    // owns them, so a key nobody has saved is empty in the reader. What the operator
    // sees before the first save is the field's *default* on the Settings screen, which
    // is where `config/site.ts` belongs — not a second value in the `<head>`.
    const empty = await getSiteMeta('ar');
    expect(empty).toEqual({ title: '', description: '', verification: null });

    await db
      .insertInto('settings')
      .values([
        { group_name: SEO_SETTING_GROUP, setting_key: 'title.ar', value: JSON.stringify('عنوان من اللوحة'), default_value: null, is_secret: 0, version: 1 },
        { group_name: SEO_SETTING_GROUP, setting_key: 'description.en', value: JSON.stringify('A description from the console'), default_value: null, is_secret: 0, version: 1 },
        { group_name: SEO_SETTING_GROUP, setting_key: 'verification.google', value: JSON.stringify('google-site-verification=abc'), default_value: null, is_secret: 0, version: 1 },
      ])
      .execute();

    expect(await getSiteMeta('ar')).toEqual({
      title: 'عنوان من اللوحة',
      description: '',
      verification: 'google-site-verification=abc',
    });
    expect(await getSiteMeta('en')).toEqual({
      title: '',
      description: 'A description from the console',
      verification: 'google-site-verification=abc',
    });

    // A blank row is not a saved word: the key leaves the answer entirely.
    await db
      .updateTable('settings')
      .set({ value: JSON.stringify('   ') })
      .where('group_name', '=', SEO_SETTING_GROUP)
      .where('setting_key', '=', 'title.ar')
      .execute();
    expect((await getSiteMeta('ar')).title).toBe('');
  });
});
