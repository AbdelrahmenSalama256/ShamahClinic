/**
 * BK-6.3 the site's one read path, against the disposable `shamah_cms_test` database.
 *
 * The behaviour worth proving is the seam itself — which rung answered, and what
 * that means for a row the other rung holds:
 *   - while the database has nothing published of a kind, the site renders the
 *     committed WordPress snapshot exactly as it did before the seam existed;
 *   - one published row takes that whole kind over: a kind is never a merge of the
 *     two sources, and a slug the database does not have is a 404 rather than
 *     something the snapshot happens to still contain;
 *   - a visitor sees the published copy only: a draft, an unpublished edit, a
 *     disabled offer or page and a trashed row never reach the site;
 *   - the published HTML goes through the same sanitizer the WordPress body did, so
 *     an authored `<script>` cannot ride into `dangerouslySetInnerHTML`;
 *   - a list (`branches`, `services`) is chosen per **list**, not per kind: two
 *     lists of the same table can sit on different rungs at the same time;
 *   - settings are the exception: a saved `site` key replaces the config value for
 *     that one field only, a blank or secret row never reaches a public reader.
 *
 * Every fixture is named `site-<run>` and removed in `afterAll`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { createRow, getRow, saveDraft, setTrashed, type ContentRow, type StoreResult } from '../src/lib/content/store';
import { publishRow } from '../src/lib/content/publish';
import type { ContentKind, ContentLocale } from '../src/lib/content/kinds';
import {
  getAllArticles,
  getAllOffers,
  getAllPages,
  getBranches,
  getBranchList,
  getCategories,
  getHeroPhotos,
  getHome,
  getHomeIntro,
  getHomeProseSections,
  getOffer,
  getOffers,
  getPage,
  getPageTitle,
  getPost,
  getPosts,
  getServiceCards,
  getSettings,
} from '../src/lib/content/site';
import { SITE_URL } from '../src/lib/site';
import { images } from '../src/lib/images';
import { homeIntroFallback } from '../src/data/about';
import { siteConfig } from '../src/config/site';
import { WHATSAPP } from '../src/lib/wp/config';
import * as wp from '../src/lib/wp';

const run = randomUUID().slice(0, 8);
const key = (name: string): string => `site-${run}-${name}`;
const actor = { id: randomUUID(), email: `site-${run}@example.invalid` };

/** The store and the publish step answer `StoreResult`; a failure must fail the test loudly. */
function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

async function rowOf(kind: ContentKind, id: string): Promise<ContentRow> {
  const row = await getRow(kind, id);
  if (!row) throw new Error(`${kind} ${id} disappeared`);
  return row;
}

/** Write both locales through the console's own store, then publish them. */
async function seed(
  kind: ContentKind,
  name: string,
  fields: Partial<Record<ContentLocale, Record<string, unknown>>>,
  locales: ContentLocale[] = ['ar', 'en'],
): Promise<ContentRow> {
  const created = unwrap(await createRow(kind, { key: key(name), actorId: actor.id }), `create ${name}`);
  for (const locale of locales) {
    const values = fields[locale];
    if (!values) continue;
    const current = await rowOf(kind, created.id);
    unwrap(await saveDraft(kind, { id: created.id, locale, fields: values, expectedVersion: current.version, actorId: actor.id }), `save ${name} ${locale}`);
  }
  const current = await rowOf(kind, created.id);
  return unwrap(await publishRow(kind, { id: current.id, locales, actor }), `publish ${name}`).row;
}

/**
 * A list item's whole content is one JSON document, so the console writes `data`
 * and the reader decides what the keys mean.
 */
async function seedItem(
  listKey: string,
  uid: string,
  data: Record<string, unknown>,
  options: { position?: number; enabled?: boolean } = {},
): Promise<ContentRow> {
  const created = unwrap(await createRow('list_item', { key: uid, listKey, actorId: actor.id }), `create ${listKey}/${uid}`);
  unwrap(
    await saveDraft('list_item', {
      id: created.id,
      locale: 'en',
      fields: { data, position: options.position ?? 0, enabled: options.enabled ?? true },
      expectedVersion: created.version,
      actorId: actor.id,
    }),
    `save ${listKey}/${uid}`,
  );
  return unwrap(await publishRow('list_item', { id: created.id, locales: ['en'], actor }), `publish ${listKey}/${uid}`).row;
}

/**
 * Rewrite a row's stored documents the way the database holds them, with the console's
 * schema out of the way. A row older than the typed forms is in a shape the form would
 * refuse, and the site's readers still have to answer from it; this is how a test puts
 * one there, not a way to write content.
 */
async function storeDocs(uid: string, doc: Record<string, unknown>): Promise<void> {
  const json = JSON.stringify(doc);
  await db.updateTable('list_items').set({ draft: json, published: json }).where('uid', '=', uid).execute();
}

async function ensureList(listKey: string): Promise<void> {
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto('lists')
    .values({ id: randomUUID(), list_key: listKey, label: listKey, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: 0 })
    .execute();
}

/** Everything this suite can create, so a crashed run leaves no published row behind. */
async function purge(): Promise<void> {
  const ids = [
    ...(await db.selectFrom('articles').select('id').where('slug', 'like', 'site-%').execute()),
    ...(await db.selectFrom('offers').select('id').where('slug', 'like', 'site-%').execute()),
    ...(await db.selectFrom('pages').select('id').where('route', 'like', 'site-%').execute()),
    ...(await db.selectFrom('pages').select('id').where('route', 'like', '/site-%').execute()),
    ...(await db.selectFrom('list_items').select('id').where('uid', 'like', 'site-%').execute()),
  ].map((row) => row.id);
  await db.deleteFrom('articles').where('slug', 'like', 'site-%').execute();
  await db.deleteFrom('offers').where('slug', 'like', 'site-%').execute();
  await db.deleteFrom('pages').where('route', 'like', 'site-%').execute();
  await db.deleteFrom('pages').where('route', 'like', '/site-%').execute();
  await db.deleteFrom('list_items').where('uid', 'like', 'site-%').execute();
  await db.deleteFrom('categories').where('slug', 'like', 'site-%').execute();
  await db.deleteFrom('settings').where('group_name', 'in', ['site', `${run}-settings`]).where('setting_key', 'in', SETTING_KEYS).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

const categoryId = randomUUID();

/**
 * The keys `getSettings` can read. They are the real `site` group's real keys — a
 * reader that only understood a test-shaped group would prove nothing — so the
 * suite writes them and deletes exactly them again.
 */
const SETTING_KEYS = ['name', 'tagline', 'phone', 'whatsapp', 'email', 'hours'];

beforeAll(async () => {
  assertTestDb();
  await purge();
  await ensureList('branches');
  await ensureList('services');
  await db
    .insertInto('categories')
    .values({ id: categoryId, slug: key('laser'), name_ar: 'ليزر', name_en: 'Laser', position: 1, enabled: 1 })
    .execute();
});

afterAll(async () => {
  await purge();
  await destroyDb();
});

describe('the fallback rung', () => {
  it('serves the committed snapshot while the database holds nothing published', async () => {
    const [fromSite, fromWp] = await Promise.all([getAllArticles(), wp.getAllArticles()]);
    expect(fromWp.length).toBeGreaterThan(0);
    expect(fromSite).toHaveLength(fromWp.length);
    expect(fromSite.map((card) => card.slug)).toEqual(fromWp.map((card) => card.slug));
  });

  it('reads a WordPress page and its heading through the same door', async () => {
    const throughSeam = await getPage('privacy-policy');
    expect(throughSeam?.item.slug).toBe('privacy-policy');
    expect(throughSeam?.seo.en.title).toBeTruthy();
    const title = await getPageTitle('privacy-policy', { ar: 'سياسة الخصوصية', en: 'Privacy Policy' });
    expect(title.en).toBe(throughSeam?.item.title.en);
  });

  it('renders the WordPress branches and services while their lists hold nothing', async () => {
    const [fromSite, fromWp] = await Promise.all([getBranches(), wp.getBranches()]);
    expect(fromWp.length).toBeGreaterThan(0);
    expect(fromSite.map((branch) => branch.id)).toEqual(fromWp.map((branch) => branch.id));
    const [cards, wpCards] = await Promise.all([getServiceCards(), wp.getServiceCards()]);
    expect(wpCards.length).toBeGreaterThan(0);
    expect(cards.map((card) => card.slug)).toEqual(wpCards.map((card) => card.slug));
  });
});

describe('the database rung', () => {
  it('takes a whole kind over from one published row', async () => {
    const article = await seed('article', 'post', {
      ar: { title: 'عناية بالبشرة', excerpt: 'مقال قصير', content: '<p>الفقرة العربية</p>' },
      en: { title: 'Skincare guide', excerpt: 'A short article', content: '<p>The English paragraph</p>' },
    });

    const cards = await getAllArticles();
    expect(cards).toHaveLength(1);
    expect(cards[0].slug).toBe(article.key);
    expect(cards[0].title).toEqual({ ar: 'عناية بالبشرة', en: 'Skincare guide' });
    // A row this console created carries no WordPress id, so it is numbered apart.
    expect(cards[0].id).toBe(-1);
    expect(cards[0].href).toEqual({ ar: `/ar/blogs/${article.key}`, en: `/blogs/${article.key}` });
    // The snapshot is untouched — a kind is never the two sources merged.
    expect(await wp.getAllArticles()).not.toHaveLength(1);
  });

  it('keeps an imported row WordPress id, and hides a draft, an unpublished edit and a trash', async () => {
    const stored = await db.selectFrom('articles').select('id').where('slug', '=', key('post')).executeTakeFirstOrThrow();
    await db.updateTable('articles').set({ legacy_id: '9001' }).where('id', '=', stored.id).execute();
    expect((await getAllArticles())[0].id).toBe(9001);

    const detail = await getPost(key('post'));
    expect(detail?.item.content.en).toContain('English paragraph');
    expect(detail?.item.content.ar).toContain('الفقرة العربية');

    // An editor's next change stays in the draft until somebody publishes it.
    unwrap(await saveDraft('article', { id: stored.id, locale: 'en', fields: { title: 'Rewritten, unpublished' }, actorId: actor.id }), 'draft the retitle');
    expect((await getPost(key('post')))?.item.title.en).toBe('Skincare guide');

    unwrap(await setTrashed('article', { id: stored.id, trashed: true, actorId: actor.id }), 'trash');
    // With nothing published of the kind left, the read goes back to the snapshot.
    const afterTrash = await getAllArticles();
    expect(afterTrash.map((card) => card.slug)).toEqual((await wp.getAllArticles()).map((card) => card.slug));

    unwrap(await setTrashed('article', { id: stored.id, trashed: false, actorId: actor.id }), 'restore');
    expect((await getAllArticles()).map((card) => card.slug)).toEqual([key('post')]);
  });

  it('answers 404 for a slug the database does not have', async () => {
    expect(await getPost('this-slug-is-not-in-the-database')).toBeNull();
    // …even though the other rung could still have found something.
    const snapshot = await wp.getAllArticles();
    expect(await wp.getPost(snapshot[0].slug)).not.toBeNull();
  });

  it('carries the category, the published date and the list filters', async () => {
    const stored = await db.selectFrom('articles').select('id').where('slug', '=', key('post')).executeTakeFirstOrThrow();
    // The console saves a locale's whole document, so the English title is written
    // back here — publishing this locale would otherwise publish the retitle that
    // the previous case deliberately left unpublished.
    unwrap(await saveDraft('article', { id: stored.id, locale: 'en', fields: { categoryId, title: 'Skincare guide' }, actorId: actor.id }), 'tag the category');
    unwrap(await publishRow('article', { id: stored.id, locales: ['en'], actor }), 'publish the tag');

    const [card] = await getAllArticles();
    expect(card.categorySlug).toBe(key('laser'));
    expect(card.category).toEqual({ ar: 'ليزر', en: 'Laser' });
    expect(new Date(card.date).getTime()).toBeGreaterThan(0);
    expect(card.modified).toBeTruthy();

    const chips = await getCategories();
    const laser = chips.find((chip) => chip.slug === key('laser'));
    expect(laser?.count).toBe(1);
    expect(laser?.name.en).toBe('Laser');

    expect((await getPosts({ search: 'skincare' })).items).toHaveLength(1);
    expect((await getPosts({ search: 'عناية' })).items).toHaveLength(1);
    expect((await getPosts({ category: 'no-such-category' })).items).toHaveLength(0);
    // The list page clamps an out-of-range page to the last real one.
    const clamped = await getPosts({ perPage: 1, page: 2 });
    expect(clamped.page).toBe(1);
    expect(clamped.totalPages).toBe(1);

    const detail = await getPost(key('post'));
    expect(detail?.seo.ar?.description).toBe('مقال قصير');
    // The default language keeps the bare path; English gets its prefix.
    expect(detail?.seo.ar?.canonical).toBe(`${SITE_URL}/blogs/${key('post')}`);
    expect(detail?.seo.en.canonical).toBe(`${SITE_URL}/en/blogs/${key('post')}`);
  });

  it('renders an offer from its published row and drops a disabled one', async () => {
    const offer = await seed('offer', 'hydra', {
      ar: { name: 'جلسة هيدرافيشل', excerpt: 'تنظيف عميق', body: '<ul><li>تشمل التنظيف</li></ul>' },
      en: { name: 'Hydrafacial session', excerpt: 'Deep cleanse', body: '<ul><li>Includes a cleanse</li><script>alert(1)</script></ul>' },
    });
    const stored = await db.selectFrom('offers').select(['id', 'version']).where('slug', '=', offer.key).executeTakeFirstOrThrow();
    unwrap(
      await saveDraft(
        'offer',
        {
          id: stored.id,
          locale: 'en',
          fields: {
            price: 1500,
            regularPrice: 2000,
            onSale: true,
            currency: 'EGP',
            images: ['/images/treatment-hydrafacial.jpg'],
          },
          expectedVersion: stored.version,
          actorId: actor.id,
        },
      ),
      'price the offer',
    );

    const [card] = await getAllOffers('en');
    expect(card.slug).toBe(offer.key);
    expect(card.price).toBe(1500);
    expect(card.regularPrice).toBe(2000);
    expect(card.discountPercent).toBe(25);
    expect(card.image).toBe('/images/treatment-hydrafacial.jpg');
    // WooCommerce sends most product images with an empty alt, so the published name stands in.
    expect(card.imageAlt).toEqual({ ar: 'جلسة هيدرافيشل', en: 'Hydrafacial session' });

    const detail = await getOffer(key('hydra'));
    expect(detail?.item.html.en).toContain('Includes a cleanse');
    expect(detail?.item.html.en).not.toContain('alert(1)');
    expect(detail?.item.href).toEqual({ ar: `/offers/${offer.key}`, en: `/offers/${offer.key}` });
    expect(await getOffer('no-such-offer')).toBeNull();
    expect((await getOffers({ perPage: 30 }, 'ar')).items).toHaveLength(1);

    unwrap(await saveDraft('offer', { id: stored.id, locale: 'en', fields: { enabled: false }, actorId: actor.id }), 'disable');
    expect(await getAllOffers('en')).toHaveLength(0);
    expect(await getOffer(key('hydra'))).toBeNull();
    unwrap(await saveDraft('offer', { id: stored.id, locale: 'en', fields: { enabled: true }, actorId: actor.id }), 're-enable');
    expect(await getAllOffers('en')).toHaveLength(1);
  });

  it('reads a page by its route in either spelling and publishes the Arabic rule', async () => {
    const page = await seed('page', 'about', {
      ar: { title: 'من نحن', content: '<p>عيادات شامه في مدينة نصر</p>' },
      en: { title: 'About us', content: '<p>Shamah Clinics in Nasr City</p>' },
    });
    // The console may hold a route with its leading slash; the site asks without it.
    await db.updateTable('pages').set({ route: `/${page.key}` }).where('id', '=', page.id).execute();

    const found = await getPage(page.key);
    expect(found?.item.slug).toBe(page.key);
    expect(found?.item.html.ar).toContain('مدينة نصر');
    expect(found?.item.href).toEqual({ ar: `/ar/${page.key}`, en: `/${page.key}` });
    expect((await getAllPages()).map((card) => card.slug)).toEqual([page.key]);

    const authored = { ar: 'عنوان مكتوب يدويًا', en: 'Home' };
    expect(await getPageTitle(page.key, authored)).toEqual({ ar: 'من نحن', en: 'About us' });

    // A page whose Arabic column holds English keeps the authored Arabic instead.
    const stored = await db.selectFrom('pages').select('id').where('route', '=', `/${page.key}`).executeTakeFirstOrThrow();
    unwrap(await saveDraft('page', { id: stored.id, locale: 'ar', fields: { title: 'About us, untranslated' }, actorId: actor.id }), 'write the ar title');
    unwrap(await publishRow('page', { id: stored.id, locales: ['ar'], actor }), 'publish the ar title');
    expect(await getPageTitle(page.key, authored)).toEqual({ ar: authored.ar, en: 'About us' });

    unwrap(await saveDraft('page', { id: stored.id, locale: 'en', fields: { enabled: false }, actorId: actor.id }), 'disable');
    expect(await getPage(page.key)).toBeNull();
    expect(await getAllPages()).toHaveLength(0);
  });

  it('assembles the homepage from database rows where they exist', async () => {
    const home = await getHome({ offers: 2, articles: 2 });
    expect(home.articles.map((card) => card.slug)).toEqual([key('post')]);
    expect(home.offers.map((offer) => offer.slug)).toEqual([key('hydra')]);
    expect(home.branches.length).toBeGreaterThan(0);
    expect(home.settings.name).toBeTruthy();
  });

  it('reads a saved setting per key, and never a secret one', async () => {
    const authored = await getSettings('en');
    expect(authored.name).toBe(siteConfig.brand.name.en);
    expect(authored.whatsapp).toBe(WHATSAPP);

    await db
      .insertInto('settings')
      .values([
        { group_name: 'site', setting_key: 'name', value: JSON.stringify('شامه سي إم إس'), default_value: null, is_secret: 0, version: 1 },
        { group_name: 'site', setting_key: 'whatsapp', value: JSON.stringify('20555000111'), default_value: null, is_secret: 0, version: 1 },
        // A blank is not an edit: the field keeps the config value rather than rendering nothing.
        { group_name: 'site', setting_key: 'email', value: JSON.stringify('   '), default_value: null, is_secret: 0, version: 1 },
        // A secret row is hidden from the console, so it is hidden from a public reader too.
        { group_name: 'site', setting_key: 'phone', value: JSON.stringify('+20999000111'), default_value: null, is_secret: 1, version: 1 },
        // Same key, different group: `site` is this reader's group and no other.
        { group_name: `${run}-settings`, setting_key: 'name', value: JSON.stringify('another group'), default_value: null, is_secret: 0, version: 1 },
      ])
      .execute();

    const saved = await getSettings('en');
    expect(saved.name).toBe('شامه سي إم إس');
    expect(saved.whatsapp).toBe('20555000111');
    // The fallback is per key: an operator who saved a name still gets the authored
    // email (blank) and the authored phone (the secret row never reaches here).
    expect(saved.email).toBe(authored.email);
    expect(saved.phone).toBe(authored.phone);
    // The two counted fields stay counted — they are not settings.
    expect(saved.branches).toBe((await getBranches()).length);
    expect(saved.currency).toBe(authored.currency);
    // `lang` picks offers and branches, not the saved words — see the reader's note.
    expect((await getSettings('ar')).name).toBe('شامه سي إم إس');

    // Clearing a field hands it back to the config file, one key at a time.
    await db
      .updateTable('settings')
      .set({ value: JSON.stringify('') })
      .where('group_name', '=', 'site')
      .where('setting_key', '=', 'name')
      .execute();
    expect((await getSettings('en')).name).toBe(siteConfig.brand.name.en);

    await db.deleteFrom('settings').where('group_name', 'in', ['site', `${run}-settings`]).where('setting_key', 'in', SETTING_KEYS).execute();
    expect((await getSettings('en')).whatsapp).toBe(WHATSAPP);
  });

  it('parses the homepage blocks out of the published home row, raw', async () => {
    // The hero slider and the two prose rows are not fields: they are parsed out of the
    // page's builder markup, which is why this reads a body `body()` would sanitize away.
    const slide = 'https://shamahclinics.com/wp-content/uploads/2026/01/bk6c-slide.jpg';
    const body = (heading: string, lead: string): string =>
      `<div class="vc_row"><rs-module><rs-slide><img data-lazyload="${slide}" alt="Laser hair removal" width="1280" height="720"></rs-slide></rs-module></div>` +
      `<div class="vc_row" id="about"><h2>${heading}</h2><p>${lead}</p></div>` +
      `<div class="vc_row" id="process"><h2>The process</h2><p>${lead}</p></div>`;
    const en = body('Who we are', 'Shamah writes its own introduction into a database row.');
    const ar = body('Who we are', 'عيادات شامه تكتب مقدمتها هنا في صف من قاعدة البيانات.');

    // Pages are on the database rung already (the `about` row above), and it holds no
    // `home` row: the authored photo and copy answer, not a WordPress page fetched
    // beside database ones. Same rule that makes an unknown slug a 404.
    expect(await getHeroPhotos()).toEqual([images.hero]);
    expect(await getHomeIntro()).toEqual({ title: homeIntroFallback.title, lead: homeIntroFallback.lead });
    expect(await getHomeProseSections()).toEqual([]);

    const created = unwrap(await createRow('page', { key: 'home', actorId: actor.id }), 'create home');
    try {
      for (const locale of ['ar', 'en'] as const) {
        const current = await rowOf('page', created.id);
        unwrap(
          await saveDraft('page', {
            id: current.id,
            locale,
            fields: { title: locale === 'ar' ? 'من نحن' : 'Home', content: locale === 'ar' ? ar : en },
            expectedVersion: current.version,
            actorId: actor.id,
          }),
          `save home ${locale}`,
        );
      }
      unwrap(await publishRow('page', { id: created.id, locales: ['ar', 'en'], actor }), 'publish home');

      const [hero] = await getHeroPhotos();
      expect(hero.src).toContain('/wp-content/uploads/2026/01/bk6c-slide.jpg');
      expect(hero.alt).toEqual({ ar: 'Laser hair removal', en: 'Laser hair removal' });
      expect(hero.width).toBe(1280);

      const intro = await getHomeIntro();
      expect(intro.title.en).toBe('Who we are');
      // The row's Arabic heading is English text, so the authored Arabic stays — the
      // rule `parseHomeProse` applies to every untranslated subsite row.
      expect(intro.title.ar).toBe(homeIntroFallback.title.ar);
      expect(intro.lead.en).toContain('database row');
      expect(intro.lead.ar).toContain('قاعدة البيانات');

      const sections = await getHomeProseSections();
      expect(sections.map((section) => section.heading.en)).toEqual(['The process']);
      expect(sections[0].paragraphs[0].ar).toContain('قاعدة البيانات');

      // The row is a page as well: rendered through `getPage` its builder tags are gone,
      // while the hero reader still sees them. Raw on one door, sanitized on the other.
      const page = await getPage('home');
      expect(page?.item.html.en).toContain('Shamah writes its own introduction');
      expect(page?.item.html.en).not.toContain('rs-slide');
      // The `about` row of the test above is disabled, so this is the only page left.
      expect((await getAllPages()).map((card) => card.slug)).toEqual(['home']);
    } finally {
      await db.deleteFrom('revisions').where('entity_id', '=', created.id).execute();
      await db.deleteFrom('pages').where('id', '=', created.id).execute();
    }

    expect(await getHeroPhotos()).toEqual([images.hero]);
  });
});

describe('the list kinds', () => {
  it('takes a list over from its published rows, in the console order', async () => {
    await seedItem(
      'branches',
      key('maadi'),
      { name: 'فرع التجمع', address: { ar: 'التجمع الخامس', en: 'Fifth Settlement' }, phone: '01000000001' },
      { position: 2 },
    );
    await seedItem(
      'branches',
      key('nasr'),
      {
        name: { ar: 'فرع مدينة نصر', en: 'Nasr City Branch' },
        area: { ar: 'مدينة نصر', en: 'Nasr City' },
        address: { ar: '٨ شارع مصطفى حمام', en: '8 Mustafa Hammam Street' },
        phone: '01000000000',
        image: '/images/branch-nasr.jpg',
        intro: { ar: 'عيادات شامه في مدينة نصر', en: 'Shamah Clinics in Nasr City' },
        features: { ar: ['ليزر', 'بوتوكس'], en: ['Laser', 'Botox'] },
        landmark: { ar: 'خلف كنتاكي', en: 'Behind KFC' },
      },
      { position: 1 },
    );
    // Two rows the reader must not turn into a card: one the console disabled, and one
    // whose document holds no name. The typed form refuses that save now, so the second
    // arrives the way a row older than the form still sits in the database.
    await seedItem('branches', key('hidden'), { name: 'فرع مخفي' }, { enabled: false });
    await seedItem('branches', key('nameless'), { name: 'فرع بلا اسم', phone: '01000000002' });
    await storeDocs(key('nameless'), { phone: '01000000002' });

    const list = await getBranchList();
    expect(list.map((branch) => branch.id)).toEqual([key('nasr'), key('maadi')]);
    const [nasr, maadi] = list;
    expect(nasr.name).toEqual({ ar: 'فرع مدينة نصر', en: 'Nasr City Branch' });
    expect(nasr.phone).toBe('01000000000');
    expect(nasr.features).toEqual({ ar: ['ليزر', 'بوتوكس'], en: ['Laser', 'Botox'] });
    expect(nasr.landmark.en).toBe('Behind KFC');
    // A branch's photo is a slot the site can render, with its own name as the alt.
    expect(nasr.image.src).toBe('/images/branch-nasr.jpg');
    expect(nasr.image.alt).toEqual({ ar: 'فرع مدينة نصر', en: 'Nasr City Branch' });
    // One string is read as both languages, which is how a mono-lingual editor writes it.
    expect(maadi.name).toEqual({ ar: 'فرع التجمع', en: 'فرع التجمع' });
    expect(maadi.image.src).toBe('');

    // The list page's view is the same rows with the photo flattened to a URL.
    const views = await getBranches();
    expect(views.map((branch) => branch.id)).toEqual([key('nasr'), key('maadi')]);
    expect(views[0].image).toBe('/images/branch-nasr.jpg');
    expect(views[1].image).toBeNull();
  });

  it('gives a service the link the site has, or the one its author wrote', async () => {
    await seedItem('services', key('laser'), {
      name: { ar: 'إزالة الشعر بالليزر', en: 'Laser hair removal' },
      intro: { ar: 'جلسات للإزيل الدائم', en: 'Sessions for permanent reduction' },
      image: '/images/service-laser.jpg',
    });
    // One box for the link, because the site splits it into the two languages itself.
    await seedItem('services', key('own-link'), { name: 'تقشير', href: '/peeling' });

    const cards = await getServiceCards();
    expect(cards.map((card) => card.slug)).toEqual([key('laser'), key('own-link')]);
    expect(cards[0].title.en).toBe('Laser hair removal');
    expect(cards[0].image).toBe('/images/service-laser.jpg');
    // A WordPress service is a section of one page, not a route of its own.
    expect(cards[0].href).toEqual({ ar: '/ar/services', en: '/services' });
    expect(cards[1].href).toEqual({ ar: '/peeling', en: '/en/peeling' });
    // And, like every other card, it is numbered apart from a WordPress post.
    expect(cards.map((card) => card.id)).toEqual([-1, -2]);

    // The same two rows, now carrying the keys a row older than the typed form uses:
    // a nested `title` instead of `name_ar`, a paired `href` instead of one path. A reader
    // that understood only the new shape would blank the services page, so both answer.
    await storeDocs(key('laser'), {
      title: { ar: 'إزالة الشعر بالليزر', en: 'Laser hair removal' },
      intro: { ar: 'جلسات للإزيل الدائم', en: 'Sessions for permanent reduction' },
      image: '/images/service-laser.jpg',
    });
    await storeDocs(key('own-link'), { title: 'تقشير', href: { ar: '/peeling', en: '/en/peeling' } });
    const older = await getServiceCards();
    expect(older.map((card) => card.title)).toEqual(cards.map((card) => card.title));
    expect(older.map((card) => card.image)).toEqual(cards.map((card) => card.image));
    expect(older.map((card) => card.href)).toEqual(cards.map((card) => card.href));
  });

  it('chooses the rung per list, not per kind', async () => {
    const uids = [key('laser'), key('own-link')];
    const rows = await db.selectFrom('list_items').select(['id', 'uid']).where('uid', 'in', uids).execute();
    const one = rows.filter((row) => row.uid === key('own-link'));
    for (const row of one) unwrap(await setTrashed('list_item', { id: row.id, trashed: true, actorId: actor.id }), 'trash one service');
    // Still database-backed: the list has another published row, so no fallback.
    expect((await getServiceCards()).map((card) => card.slug)).toEqual([key('laser')]);

    const last = rows.filter((row) => row.uid === key('laser'));
    for (const row of last) unwrap(await setTrashed('list_item', { id: row.id, trashed: true, actorId: actor.id }), 'trash the last service');
    // The services list has nothing published, so it falls back — while the branch
    // list, which does, keeps answering from the database. Same kind, two rungs.
    expect((await getServiceCards()).map((card) => card.slug)).toEqual((await wp.getServiceCards()).map((card) => card.slug));
    expect((await getBranchList()).map((branch) => branch.id)).toEqual([key('nasr'), key('maadi')]);

    for (const row of rows) unwrap(await setTrashed('list_item', { id: row.id, trashed: false, actorId: actor.id }), 'restore the service');
    expect((await getServiceCards()).map((card) => card.slug)).toEqual([key('laser'), key('own-link')]);
  });
});
