/**
 * The site's one read path.
 *
 * WordPress is on the way out, but its committed snapshot (`data/wp/*.json`) stays
 * as the second rung until BK-7 imports the articles, offers and pages into this
 * database. So every read asks the database first and takes the snapshot only when
 * the database holds nothing published of that kind — decided once per kind, never
 * per row, so a slug that genuinely does not exist is a 404 rather than something
 * the stale snapshot happens to contain. The two rungs are provable separately:
 * today the development database holds zero content rows, so the site renders what
 * it rendered yesterday; the day the import lands, the same calls return database
 * rows and no WordPress origin is contacted.
 *
 * Each function keeps the name, arguments and returned shape of the `../wp` reader
 * it replaces, so rewiring a route is an import path. Where the two rungs cannot
 * agree — the numeric id a WordPress card carried — the shape is kept and the value
 * is documented at its maker.
 *
 * The decision is per kind, and for `list_items` it is per **list**: the branches
 * can be database-backed while the services still come from the snapshot, because
 * "has this been published yet?" is a question about one list, not about a table.
 */
import * as wp from '../wp';
import type { BranchView, PageCard, Query, WithSeo } from '../wp';
import { arabicRatio, hrefPair } from '../wp/lang';
import { decodeEntities, firstParagraph, htmlToText, sanitizeHtmlBody } from '../wp/sanitize';
import { toPhotoSlot } from '../wp/ui-helpers';
import { heroPhotos } from '../wp/hero';
import { parseHomeProse, splitHomeProse, type BilingualHomeBlock } from '../wp/home-prose';
import { homeIntroFallback } from '../../data/about';
import type { PhotoSlot } from '../images';
import type { BranchDetail } from '../../data/branches';
import type { Article, ArticleCard, Bi, CategoryTerm, Lang, Offer, OfferDetail, PageContent, Paged, SeoMeta, ServiceCard, Settings } from '../wp/types';
import { db } from '../db';
import { SITE_URL } from '../site';
import { getLocalizedHref } from '../locale';
import { siteConfig } from '../../config/site';
import { WHATSAPP } from '../wp/config';
import { hasPublished, publicRow, publicRows, type PublicRow, type PublicValue } from './published';
import type { ContentKind } from './kinds';
import { pageSlug, publicPathOf } from './paths';

export type { PageCard, Query, WithSeo };

// --- which rung answered ------------------------------------------------------

const logged = new Set<string>();
function note(rung: 'db' | 'snapshot', kind: string, detail = ''): void {
  const key = `${rung}:${kind}:${detail}`;
  if (logged.has(key)) return;
  if (logged.size > 100) logged.clear();
  logged.add(key);
  console.log(`[site] ${rung.padEnd(8)} ${kind}${detail ? ` (${detail})` : ''}`);
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60);
}

/**
 * Read a kind from the database when it has published rows, and from the snapshot
 * otherwise. A database that cannot be reached is the same answer as an empty one:
 * the site keeps rendering, which is the whole reason the snapshot is committed.
 */
async function rung<T>(kind: ContentKind, fromDb: () => Promise<T>, fromSnapshot: () => Promise<T>): Promise<T> {
  try {
    if (await hasPublished(kind)) {
      note('db', kind);
      return await fromDb();
    }
    note('snapshot', kind, 'nothing published');
  } catch (err) {
    note('snapshot', kind, reason(err));
  }
  return fromSnapshot();
}

// --- reading a row's values ---------------------------------------------------

function pair(row: PublicRow, name: string): Bi {
  const value: PublicValue | undefined = row.values[name];
  if (!value || value.kind !== 'bi') return { ar: '', en: '' };
  return { ar: value.ar || value.en, en: value.en || value.ar };
}

/** WordPress hands the site HTML-encoded titles; an editor's text is already decoded. */
function decoded(source: Bi): Bi {
  return { ar: decodeEntities(source.ar), en: decodeEntities(source.en) };
}

/** An excerpt, whichever way it was authored: plain text or a paragraph of HTML. */
function htmlPair(row: PublicRow, name: string): Bi {
  const value = pair(row, name);
  return { ar: htmlToText(value.ar), en: htmlToText(value.en) };
}

function text(row: PublicRow, name: string): string | null {
  const value = row.values[name];
  return value && value.kind === 'text' ? value.value : null;
}

function number(row: PublicRow, name: string): number | null {
  const value = row.values[name];
  return value && value.kind === 'number' ? value.value : null;
}

function flag(row: PublicRow, name: string): boolean {
  const value = row.values[name];
  return Boolean(value && value.kind === 'flag' && value.value);
}

function json(row: PublicRow, name: string): unknown {
  const value = row.values[name];
  return value && value.kind === 'json' ? value.value : null;
}

/** A body as the site renders it — the same sanitizer the WordPress body went through. */
function body(row: PublicRow, name: string): Bi {
  const value = pair(row, name);
  return { ar: sanitizeHtmlBody(value.ar), en: sanitizeHtmlBody(value.en) };
}

/**
 * The UI's cards key on a number because a WordPress post id was one. An imported
 * row keeps its WordPress id; a row the console created gets a negative one, so a
 * locally written article can never be mistaken for a WordPress post by anything
 * that reads the API.
 */
function numericId(row: PublicRow, index: number): number {
  const legacy = Number(row.legacyId);
  if (row.legacyId && Number.isInteger(legacy) && legacy > 0) return legacy;
  return -(index + 1);
}

function lookupKey(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function haystack(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function matches(term: string | undefined, text: string): boolean {
  if (!term) return true;
  return text.includes(term.trim().toLowerCase());
}

/**
 * SEO built from the row's own published copy. Nothing is fetched from WordPress.
 *
 * The path comes from `./paths.ts` — the same rule the console's preview link uses —
 * so a row cannot be published at one URL and indexed at another.
 */
function publicSeo(kind: ContentKind, key: string, title: Bi, description: Bi, ogImage: string | null): { en: SeoMeta; ar: SeoMeta | null } {
  const path = publicPathOf(kind, key) ?? '/';
  const forLocale = (locale: Lang): SeoMeta => {
    const other: Lang = locale === 'ar' ? 'en' : 'ar';
    const heading = title[locale] || title[other];
    return {
      title: heading,
      description: description[locale] || description[other] || heading,
      canonical: `${SITE_URL}${getLocalizedHref(path, locale)}`,
      ogImage,
    };
  };
  return { en: forLocale('en'), ar: forLocale('ar') };
}

// --- journal ------------------------------------------------------------------

interface CategoryRef {
  slug: string;
  name: Bi;
}

/** The `categories` rows an article's `category_id` can point at. */
async function categoryIndex(): Promise<Map<string, CategoryRef>> {
  const rows = await db
    .selectFrom('categories')
    .select(['id', 'slug', 'name_ar', 'name_en'])
    .where('deleted_at', 'is', null)
    .execute();
  return new Map(rows.map((row) => [row.id, { slug: row.slug, name: { ar: row.name_ar || row.name_en, en: row.name_en || row.name_ar } }]));
}

function articleCard(row: PublicRow, index: number, categories: Map<string, CategoryRef>): ArticleCard {
  const title = decoded(pair(row, 'title'));
  const category = text(row, 'categoryId');
  const ref = category ? categories.get(category) : undefined;
  return {
    id: numericId(row, index),
    slug: row.key,
    title,
    excerpt: htmlPair(row, 'excerpt'),
    image: text(row, 'image'),
    imageAlt: decoded(pair(row, 'imageAlt')),
    date: row.publishedAt ?? row.updatedAt,
    modified: row.updatedAt,
    category: ref?.name ?? null,
    categorySlug: ref?.slug ?? null,
    href: hrefPair(publicPathOf('article', row.key)!),
  };
}

export async function getAllArticles(): Promise<ArticleCard[]> {
  return rung(
    'article',
    async () => {
      const [rows, categories] = await Promise.all([publicRows('article'), categoryIndex()]);
      return rows.map((row, index) => articleCard(row, index, categories));
    },
    () => wp.getAllArticles(),
  );
}

export async function getPosts(q: Query = {}): Promise<Paged<ArticleCard>> {
  let cards = await getAllArticles();
  if (q.category) cards = cards.filter((card) => card.categorySlug === q.category);
  if (q.search) {
    cards = cards.filter((card) => matches(q.search, haystack(card.title.ar, card.title.en, card.excerpt.ar, card.excerpt.en)));
  }
  return wp.paginate(cards, q.page, q.perPage);
}

export async function getPost(slug: string): Promise<WithSeo<Article> | null> {
  return rung(
    'article',
    async () => {
      const row = await publicRow('article', lookupKey(slug));
      if (!row) return null;
      const categories = await categoryIndex();
      const card = articleCard(row, 0, categories);
      const content = body(row, 'content');
      const article: Article = {
        ...card,
        // A card with no teaser still needs one, and the body's first paragraph is
        // what the site shows beside it.
        excerpt: {
          ar: card.excerpt.ar || firstParagraph(content.ar),
          en: card.excerpt.en || firstParagraph(content.en),
        },
        content,
      };
      return { item: article, seo: publicSeo('article', card.slug, article.title, article.excerpt, article.image) };
    },
    () => wp.getPost(slug),
  );
}

export async function getCategories(): Promise<CategoryTerm[]> {
  try {
    const [rows, counts] = await Promise.all([
      db
        .selectFrom('categories')
        .select(['id', 'slug', 'name_ar', 'name_en'])
        .where('deleted_at', 'is', null)
        .where('enabled', '=', 1)
        .orderBy('position', 'asc')
        .execute(),
      articleCategoryCounts(),
    ]);
    if (rows.length) {
      note('db', 'category');
      return rows
        .map((row, index) => ({
          id: index + 1,
          slug: row.slug,
          name: { ar: row.name_ar || row.name_en, en: row.name_en || row.name_ar },
          count: counts.get(row.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count);
    }
    note('snapshot', 'category', 'no categories');
  } catch (err) {
    note('snapshot', 'category', reason(err));
  }
  return wp.getCategories();
}

/** How many published articles each category holds — the chip's count. */
async function articleCategoryCounts(): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('articles')
    .select(['category_id'])
    .where('status', '=', 'published')
    .where('deleted_at', 'is', null)
    .execute();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return counts;
}

// --- offers -------------------------------------------------------------------

/** An authored image entry: a URL, or an object with the alt text in both languages. */
function offerImages(value: unknown, name: Bi): Array<{ src: string; alt: Bi }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ src: string; alt: Bi }> = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const src = entry.trim();
      if (src) out.push({ src, alt: name });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as { src?: unknown; alt?: unknown };
    const src = typeof raw.src === 'string' ? raw.src.trim() : '';
    if (!src) continue;
    const alt = typeof raw.alt === 'string' ? raw.alt.trim() : '';
    // WooCommerce prints an empty alt for most product images, so the product's own
    // name stands in — an image with no text at all is unreadable to a screen reader.
    out.push({ src, alt: { ar: alt || name.ar || name.en, en: alt || name.en || name.ar } });
  }
  return out;
}

function offer(row: PublicRow, index: number): Offer {
  const name = decoded(pair(row, 'name'));
  const price = number(row, 'price') ?? 0;
  const regular = number(row, 'regularPrice') || price;
  const onSale = flag(row, 'onSale');
  const discount = onSale && regular > price && price > 0 ? Math.round(((regular - price) / regular) * 100) : null;
  const images = offerImages(json(row, 'images'), name);
  return {
    id: numericId(row, index),
    slug: row.key,
    name,
    excerpt: htmlPair(row, 'excerpt'),
    price,
    regularPrice: regular,
    currency: text(row, 'currency') || 'EGP',
    onSale,
    discountPercent: discount,
    images,
    image: images[0]?.src ?? null,
    imageAlt: images[0]?.alt ?? { ar: '', en: '' },
    // Both languages carry the same unprefixed path because that is how the snapshot
    // spells an offer link (`../wp/mappers.ts`), and `decideRoute()` renders an Arabic
    // page for it either way. The prefix is the one thing the two rungs must agree on.
    href: { ar: publicPathOf('offer', row.key)!, en: publicPathOf('offer', row.key)! },
  };
}

/**
 * Offers in the language being rendered. One database row carries both locales, so
 * `lang` only decides the fallback's snapshot — the list, its order and its prices
 * are the published rows either way.
 */
export async function getAllOffers(lang: Lang = 'en'): Promise<Offer[]> {
  return rung(
    'offer',
    async () => (await publicRows('offer')).filter((row) => flag(row, 'enabled')).map(offer),
    () => wp.getAllOffers(lang),
  );
}

export async function getOffers(q: Query = {}, lang: Lang = 'en'): Promise<Paged<Offer>> {
  let offers = await getAllOffers(lang);
  if (q.search) {
    offers = offers.filter((offer) => matches(q.search, haystack(offer.name.ar, offer.name.en, offer.excerpt.ar, offer.excerpt.en)));
  }
  return wp.paginate(offers, q.page, q.perPage);
}

export async function getOffer(slug: string, lang: Lang = 'en'): Promise<WithSeo<OfferDetail> | null> {
  return rung(
    'offer',
    async () => {
      const row = await publicRow('offer', lookupKey(slug));
      if (!row || !flag(row, 'enabled')) return null;
      const detail = { ...offer(row, 0), html: body(row, 'body') };
      return { item: detail, seo: publicSeo('offer', detail.slug, detail.name, detail.excerpt, detail.image) };
    },
    () => wp.getOffer(slug, lang),
  );
}

// --- pages --------------------------------------------------------------------

function pageCard(row: PublicRow, index: number): PageCard {
  const slug = pageSlug(row.key);
  const content = pair(row, 'content');
  return {
    id: numericId(row, index),
    slug,
    modified: row.updatedAt,
    title: decoded(pair(row, 'title')),
    // A page has no excerpt column; the body's first paragraph is what a card shows.
    excerpt: { ar: firstParagraph(content.ar), en: firstParagraph(content.en) },
    href: hrefPair(publicPathOf('page', row.key)!),
  };
}

export async function getAllPages(): Promise<PageCard[]> {
  return rung(
    'page',
    async () => (await publicRows('page')).filter((row) => flag(row, 'enabled')).map(pageCard),
    () => wp.getAllPages(),
  );
}

export async function getPages(q: Query = {}): Promise<Paged<PageCard>> {
  const cards = await getAllPages();
  const filtered = q.search
    ? cards.filter((card) => matches(q.search, haystack(card.title.ar, card.title.en, card.excerpt.en)))
    : cards;
  return wp.paginate(filtered, q.page, q.perPage);
}

export async function getPage(slug: string): Promise<WithSeo<PageContent> | null> {
  return rung(
    'page',
    async () => {
      const row = await publicRow('page', lookupKey(slug));
      if (!row || !flag(row, 'enabled')) return null;
      const page: PageContent = {
        id: numericId(row, 0),
        slug: pageSlug(row.key),
        title: decoded(pair(row, 'title')),
        html: body(row, 'content'),
        href: hrefPair(publicPathOf('page', row.key)!),
      };
      return { item: page, seo: publicSeo('page', row.key, page.title, { ar: '', en: '' }, null) };
    },
    () => wp.getPage(slug),
  );
}

/**
 * A page's heading as its authors write it, for the hero title of the matching
 * route. Arabic only wins when the row actually holds Arabic — the fallback keeps
 * the authored heading instead of opening an Arabic page with an English one.
 */
export async function getPageTitle(slug: string, authored: Bi): Promise<Bi> {
  const card = (await getAllPages()).find((page) => page.slug === pageSlug(slug));
  if (!card) return authored;
  return {
    ar: arabicRatio(card.title.ar) > 0.3 ? card.title.ar : authored.ar,
    en: card.title.en || authored.en,
  };
}

// --- lists --------------------------------------------------------------------

/**
 * The site's repeatable lists — branches, services, and the lists still to come —
 * live in `list_items`: one JSON document per row, so a list's shape is its
 * reader's business rather than a column per field.
 *
 * The document is read defensively because an editor writes it by hand: a bilingual
 * field may be `{ar, en}` or a single string for both languages, a missing value
 * falls back instead of throwing, and a row with nothing usable in it is skipped
 * rather than rendered as an empty card.
 */
async function listRung<T>(listKey: string, fromDb: () => Promise<T>, fromFallback: () => Promise<T>): Promise<T> {
  try {
    if (await hasPublished('list_item', { listKey })) {
      note('db', `list ${listKey}`);
      return await fromDb();
    }
    note('snapshot', `list ${listKey}`, 'nothing published');
  } catch (err) {
    note('snapshot', `list ${listKey}`, reason(err));
  }
  return fromFallback();
}

function documentOf(row: PublicRow): Record<string, unknown> | null {
  const value = row.values.data;
  if (!value || value.kind !== 'json' || !value.value || typeof value.value !== 'object') return null;
  return value.value as Record<string, unknown>;
}

function docText(doc: Record<string, unknown>, name: string): string {
  const value = doc[name];
  return typeof value === 'string' ? value.trim() : '';
}

/** A document's bilingual field: `{ ar, en }`, or one string read as both languages. */
function docBi(doc: Record<string, unknown>, name: string): Bi {
  const value = doc[name];
  if (typeof value === 'string') return { ar: value, en: value };
  if (!value || typeof value !== 'object') return { ar: '', en: '' };
  const both = value as Record<string, unknown>;
  const ar = typeof both.ar === 'string' ? both.ar : '';
  const en = typeof both.en === 'string' ? both.en : '';
  return { ar: ar || en, en: en || ar };
}

function docStrings(doc: Record<string, unknown>, name: string): { ar: string[]; en: string[] } {
  const keep = (list: unknown): string[] => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
  const value = doc[name];
  if (Array.isArray(value)) {
    const one = keep(value);
    return { ar: one, en: one };
  }
  if (value && typeof value === 'object') {
    const both = value as Record<string, unknown>;
    return { ar: keep(both.ar), en: keep(both.en) };
  }
  return { ar: [], en: [] };
}

// branches

/**
 * A branch row's `uid` is the id the site already uses in `/branches/<id>`, so a
 * branch keeps its URL when its row moves into the database. The photo is whatever
 * the editor pasted — a bare URL is enough, the rest of the slot takes the site's
 * defaults.
 */
function branchOf(row: PublicRow): BranchDetail | null {
  const doc = documentOf(row);
  if (!doc) return null;
  const name = docBi(doc, 'name');
  if (!name.ar && !name.en) return null;
  const image = docText(doc, 'image');
  return {
    id: row.key,
    name,
    area: docBi(doc, 'area'),
    address: docBi(doc, 'address'),
    phone: docText(doc, 'phone'),
    image: toPhotoSlot(image || null, name),
    intro: docBi(doc, 'intro'),
    features: docStrings(doc, 'features'),
    landmark: docBi(doc, 'landmark'),
  };
}

function toBranchView(b: BranchDetail): BranchView {
  return {
    id: b.id,
    name: b.name,
    area: b.area,
    address: b.address,
    phone: b.phone,
    image: b.image.src || null,
    intro: b.intro,
    features: b.features,
    landmark: b.landmark,
  };
}

export async function getBranchList(): Promise<BranchDetail[]> {
  return listRung(
    'branches',
    async () =>
      (await publicRows('list_item', { listKey: 'branches' }))
        .filter((row) => flag(row, 'enabled'))
        .map(branchOf)
        .filter((branch): branch is BranchDetail => branch !== null),
    () => wp.getBranchList(),
  );
}

export async function getBranches(): Promise<BranchView[]> {
  return (await getBranchList()).map(toBranchView);
}

// services

/**
 * A service card. WordPress has no route per service — its cards are sections of
 * one page — so a row with no link of its own points the reader at `/services`,
 * which is where the fallback's cards point too.
 */
function serviceCardOf(row: PublicRow, index: number): ServiceCard | null {
  const doc = documentOf(row);
  if (!doc) return null;
  const title = docBi(doc, 'title');
  if (!title.ar && !title.en) return null;
  const href = docBi(doc, 'href');
  return {
    id: numericId(row, index),
    slug: row.key,
    title,
    intro: docBi(doc, 'intro'),
    image: docText(doc, 'image') || null,
    href: href.ar || href.en ? href : hrefPair('services'),
  };
}

export async function getServiceCards(): Promise<ServiceCard[]> {
  return listRung(
    'services',
    async () =>
      (await publicRows('list_item', { listKey: 'services' }))
        .filter((row) => flag(row, 'enabled'))
        .map(serviceCardOf)
        .filter((card): card is ServiceCard => card !== null),
    () => wp.getServiceCards(),
  );
}

// --- settings -----------------------------------------------------------------

/**
 * A setting is one JSON value per `(group, key)`, which is why the console can gain
 * a key without a migration. `site` is this read path's group and the six keys below
 * are what a `Settings` field can be saved under.
 *
 * A row flagged `is_secret` is skipped: the console hides those values from whoever
 * is looking over the operator's shoulder, and a public reader is a worse version of
 * that room. `/api/v1/settings` answers to any visitor.
 *
 * The fallback is per key, not per call: a site that has saved a phone number still
 * takes its hours from the config file. That is the opposite of the content rungs,
 * where "has this been published?" is answered for a whole kind at a time — a
 * setting has no draft twin and no version of record, so half-filling the group is
 * a normal state rather than a broken one.
 */
const SETTING_GROUP = 'site';

/** The homepage's tagline. No config file holds it today, and BK-14 gives it an address. */
const TAGLINE = "Great Skin Doesn't Happen By Chance";

/** MariaDB prints JSON as LONGTEXT and the driver parses most, but not every, path. */
function asWord(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  // A parsed scalar arrives as the string itself; an unparsed one arrives as its JSON,
  // so only a quoted document is decoded again. Without this a phone number — all
  // digits, quotes gone — reads as a JSON number and the field silently keeps the
  // config value instead of the operator's edit.
  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return value;
    }
  }
  return text ? value : null;
}

async function savedSettings(): Promise<Map<string, string>> {
  const rows = await db
    .selectFrom('settings')
    .select(['setting_key', 'value'])
    .where('group_name', '=', SETTING_GROUP)
    .where('is_secret', '=', 0)
    .execute();
  const values = new Map<string, string>();
  for (const row of rows) {
    const value = asWord(row.value);
    // Only a word is usable here: every `Settings` field is one, and an editor
    // that saved an object would otherwise render as `[object Object]`.
    if (value?.trim()) values.set(row.setting_key, value);
  }
  return values;
}

/**
 * The site's settings: the six words an operator can edit come from the database when
 * they have been saved and from the config file otherwise, and the two counted fields
 * stay counted — they are not settings, they are the offers and branches this same
 * read path just returned.
 *
 * `lang` still does not move `name` or `hours`: both are read as English whatever the
 * page's language, which is what the site has rendered since before this read path
 * existed. Changing it would change the homepage, so it belongs to BK-14's editable
 * elements, not to a row that moves a source.
 */
export async function getSettings(lang: Lang = 'en'): Promise<Settings> {
  const [offers, branches, saved] = await Promise.all([
    getOffers({ perPage: 1 }, lang),
    getBranches(),
    savedSettings().then(
      (values) => {
        if (values.size) note('db', 'settings', `${values.size} key(s)`);
        else note('snapshot', 'settings', 'nothing saved');
        return values;
      },
      (err: unknown) => {
        note('snapshot', 'settings', reason(err));
        return new Map<string, string>();
      },
    ),
  ]);
  const field = (key: string, authored: string): string => saved.get(key) ?? authored;
  return {
    name: field('name', siteConfig.brand.name.en),
    tagline: field('tagline', TAGLINE),
    currency: offers.items[0]?.currency || 'EGP',
    phone: field('phone', siteConfig.contact.phone),
    whatsapp: field('whatsapp', WHATSAPP),
    email: field('email', siteConfig.contact.email),
    hours: field('hours', siteConfig.contact.workingHours.en),
    branches: branches.length,
  };
}

// --- the homepage's builder blocks ----------------------------------------------

/**
 * Three of the homepage's blocks are not fields. Its hero slider and its two prose
 * rows are parsed out of the page's builder markup, whose `rs-slide` and `<br>` tags a
 * renderer drops — so this takes the body **raw**, the counterpart of `body()`, and
 * nothing it reads is ever sent to a browser as HTML.
 *
 * The rung is the page kind's, not a per-row decision: once pages come from the
 * database, a missing `home` row means the authored fallback photo and copy, not a
 * WordPress page fetched alongside database ones. Same rule that makes an unknown slug
 * a 404 (`getPage`), and the reason this asks `rung` rather than looking for the row
 * first.
 */
async function rawHomeBodies(): Promise<{ en: string; ar: string }> {
  return rung(
    'page',
    async () => {
      const row = await publicRow('page', 'home');
      const content = row ? pair(row, 'content') : null;
      return { en: content?.en ?? '', ar: content?.ar ?? '' };
    },
    async () => {
      try {
        const [en, ar] = await Promise.all([wp.getRawPageHtml('home', 'en'), wp.getRawPageHtml('home', 'ar')]);
        return { en, ar };
      } catch {
        return { en: '', ar: '' };
      }
    },
  );
}

/** Homepage hero backgrounds: the slider the page publishes, or the authored photo. */
export async function getHeroPhotos(): Promise<PhotoSlot[]> {
  return heroPhotos((await rawHomeBodies()).en);
}

/** The homepage's own prose rows, read from the un-sanitized builder body. */
async function homeProse(): Promise<{ intro: BilingualHomeBlock | null; sections: BilingualHomeBlock[] }> {
  const { en, ar } = await rawHomeBodies();
  return splitHomeProse(parseHomeProse(en, ar));
}

/**
 * Home's introduction: the `#about` row of the home page — its heading and paragraph.
 * The Arabic is the authored one while the subsite serves that row untranslated,
 * and the row publishes no photo, so nothing is placed beside it from outside.
 */
export async function getHomeIntro(): Promise<{ title: Bi; lead: Bi }> {
  const { intro } = await homeProse();
  if (!intro) return { title: homeIntroFallback.title, lead: homeIntroFallback.lead };
  const lead = intro.paragraphs.find((p) => p.en);
  return {
    title: {
      ar: intro.heading.ar || homeIntroFallback.title.ar,
      en: intro.heading.en || homeIntroFallback.title.en,
    },
    lead: {
      ar: lead?.ar || homeIntroFallback.lead.ar,
      en: lead?.en || homeIntroFallback.lead.en,
    },
  };
}

/**
 * The homepage rows no other section displays (`#process`, the story band). They
 * are the data team's own copy about the clinic, so the About page shows them
 * after its page-32 sections instead of leaving them on the homepage only.
 */
export async function getHomeProseSections(): Promise<Array<{ heading: Bi; paragraphs: Bi[]; image: string | null }>> {
  const { sections } = await homeProse();
  return sections.filter((section) => section.paragraphs.length > 0);
}

// --- home ---------------------------------------------------------------------

export interface HomeData {
  settings: Settings;
  offers: Offer[];
  articles: ArticleCard[];
  branches: BranchView[];
}

/**
 * The homepage's blocks, assembled here rather than in the page so the four reads
 * that make it up cannot disagree about which rung answered.
 */
export async function getHome(opts: { offers?: number; articles?: number; lang?: Lang } = {}): Promise<HomeData> {
  const lang = opts.lang ?? 'en';
  const [settings, offersPaged, articlesPaged, branches] = await Promise.all([
    getSettings(lang),
    getOffers({ perPage: opts.offers ?? 4 }, lang),
    getPosts({ perPage: opts.articles ?? 3 }),
    getBranches(),
  ]);
  return { settings, offers: offersPaged.items, articles: articlesPaged.items, branches };
}
