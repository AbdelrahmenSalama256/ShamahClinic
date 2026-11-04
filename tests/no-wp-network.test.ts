/**
 * BK-7.4 — the proof that the site no longer asks WordPress for anything.
 *
 * Two halves, because a single assertion would prove too little:
 *
 *  1. **behaviour**: `globalThis.fetch` is replaced with a recorder that throws, then
 *     every public reader runs — the whole read path (`lib/content/site`), the kinds
 *     still on the snapshot rung, the derived readers behind /results and the treatment
 *     pages, and the About page's own reader. Zero recorded URLs means zero requests, and
 *     the content
 *     assertions in the same pass mean that "zero" is not the result of a reader
 *     quietly returning nothing.
 *  2. **structure**: a source scan, because the behaviour half can only catch a call
 *     that some test happens to reach. No `fetch(` may appear anywhere under
 *     `src/lib` apart from the first-party tracker's same-origin `/api/track` post,
 *     and `src/lib/wp/http.ts` — the live REST/Store-API client with its timeout and
 *     concurrency cap — must stay deleted. Something re-pointing the read path at the
 *     client's production host has to fail here, not in production.
 *
 * The one live WordPress call left in the app is the Contact Form 7 forward in
 * `/api/v1/lead`, gated behind `LEAD_MODE=cf7` (the default is `whatsapp`). It is a
 * write, not a read, and BK-8 replaces lead handling entirely — so it is asserted to
 * be the *only* one rather than silently tolerated.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import * as site from '../src/lib/content/site';
import * as wp from '../src/lib/wp';
import { getAboutPage } from '../src/lib/content/about-page';
import { getFeaturedServices, getMergedTreatment, getMergedTreatments } from '../src/lib/wp/treatments';

const ROOT = process.cwd();
const fetches: string[] = [];
let restore: (() => void) | null = null;

/**
 * The content half of this file asks that a network-free render still hands back real rows.
 * `getServiceCards()` and the treatment readers lost their snapshot rung at 1A, so the only
 * thing that can answer them is a published row — and a test that leans on whatever the last
 * run left in the database is not an assertion. One service, named for this run, removed
 * again in `afterAll`.
 */
const run = randomUUID().slice(0, 8);
const fixtureUid = `nowp-${run}`;

async function seedService(): Promise<void> {
  const listId = randomUUID();
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', 'services').executeTakeFirst();
  const key = existing?.id ?? listId;
  if (!existing) {
    await db
      .insertInto('lists')
      .values({ id: listId, list_key: 'services', label: 'services', item_schema: json({}), reorderable: 1, is_article_collection: 0 })
      .execute();
  }
  const doc = { name_ar: 'ليزر تجريبي', name_en: 'A test service', intro_ar: 'جلسة', intro_en: 'A session' };
  await db
    .insertInto('list_items')
    .values({
      id: randomUUID(),
      list_id: key,
      uid: fixtureUid,
      position: 0,
      enabled: 1,
      draft: json(doc),
      published: json(doc),
      status: 'published',
      published_at: new Date(),
    })
    .execute();
}

beforeAll(async () => {
  assertTestDb();
  await db.deleteFrom('list_items').where('uid', 'like', 'nowp-%').execute();
  await seedService();
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    fetches.push(String(typeof input === 'object' && input && 'url' in input ? (input as Request).url : input));
    throw new Error('this suite disables the network');
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
});

afterAll(async () => {
  restore?.();
  await db.deleteFrom('revisions').where('entity_id', '=', fixtureUid).execute();
  await db.deleteFrom('list_items').where('uid', '=', fixtureUid).execute();
  await destroyDb();
});

/** Everything a public route renders, in the language it renders it in. */
async function renderEveryPublicReader(): Promise<void> {
  const [article] = await site.getAllArticles();
  const [offer] = await site.getAllOffers('en');
  const [page] = await site.getAllPages();
  const arOffers = await site.getAllOffers('ar');
  const treatments = await getMergedTreatments();

  await Promise.all([
    site.getPosts({ page: 1, perPage: 9 }),
    site.getPosts({ search: 'laser' }),
    site.getPost(article.slug),
    site.getPost(encodeURIComponent(article.slug)),
    site.getCategories(),
    site.getOffers({ page: 1 }, 'ar'),
    site.getOffer(offer.slug, 'en'),
    site.getOffer(arOffers[0]?.slug ?? offer.slug, 'ar'),
    site.getPages({ search: 'about' }),
    site.getPage(page.slug),
    site.getPageTitle(page.slug, { ar: '', en: '' }),
    site.getBranches(),
    site.getBranchList(),
    site.getServiceCards(),
    site.getHeroPhotos(),
    site.getHomeIntro(),
    site.getHomeProseSections(),
    site.getHome({ offers: 3, articles: 3, lang: 'en' }),
    site.getHome({ offers: 3, articles: 3, lang: 'ar' }),
    site.getSettings('en'),
    site.getSettings('ar'),
    wp.getOfferCategories(),
    wp.getAllArticles(),
    wp.getPosts({ page: 1 }),
    wp.getPost(article.slug),
    wp.getOffer(offer.slug, 'ar'),
    getAboutPage(),
    site.getResultStories({ page: 1, perPage: 9 }),
    getFeaturedServices(3),
    getMergedTreatment(treatments[0]?.id ?? ''),
  ]);
}

describe('the site renders without a network', () => {
  it('makes zero requests while every public reader answers', async () => {
    await renderEveryPublicReader();
    expect(fetches).toEqual([]);
  }, 120_000);

  it('still returns the content, so "zero requests" is not an empty page', async () => {
    const [articles, offers, pages, branches, services, treatments] = await Promise.all([
      site.getAllArticles(),
      site.getAllOffers('en'),
      site.getAllPages(),
      site.getBranches(),
      site.getServiceCards(),
      getMergedTreatments(),
    ]);
    expect(articles.length).toBeGreaterThan(50);
    expect(offers.length).toBeGreaterThan(0);
    expect(pages.length).toBeGreaterThan(10);
    expect(branches.length).toBeGreaterThan(0);
    expect(services.length).toBeGreaterThan(0);
    expect(treatments.length).toBeGreaterThan(0);
  }, 120_000);
});

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('the live WordPress client is gone', () => {
  it('deleted the REST client module', () => {
    expect(existsSync(join(ROOT, 'src/lib/wp/http.ts'))).toBe(false);
  });

  it('keeps src/lib free of any network fetch, apart from the first-party tracker', () => {
    const tracker = join('src', 'lib', 'tracking', 'first-party.ts');
    const offenders = sources(join(ROOT, 'src/lib'))
      .filter((file) => readFileSync(file, 'utf8').includes('fetch('))
      .filter((file) => relative(ROOT, file) !== tracker)
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);

    // The one exception may only speak to this app's own endpoint, never to a host.
    const source = readFileSync(join(ROOT, tracker), 'utf8');
    const targets = [...source.matchAll(/(?:fetch|sendBeacon)\(\s*(['"`])([^'"`]*)\1/g)].map((match) => match[2]);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).toEqual(targets.map(() => '/api/track'));
  });

  it('leaves the CF7 lead forward as the only live call in the app, and off by default', () => {
    const route = readFileSync(join(ROOT, 'src/app/api/v1/lead/route.ts'), 'utf8');
    expect(route).toContain('wp-json');
    expect(route).toContain('LEAD_MODE');
    expect(readFileSync(join(ROOT, 'src/lib/wp/config.ts'), 'utf8')).toContain('LEAD_MODE || "whatsapp"');
    const appSources = sources(join(ROOT, 'src/app')).filter((file) => readFileSync(file, 'utf8').includes('wp-json'));
    expect(appSources.map((file) => relative(ROOT, file))).toEqual([join('src', 'app', 'api', 'v1', 'lead', 'route.ts')]);
  });
});
