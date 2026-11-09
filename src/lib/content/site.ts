/**
 * The site's one read path.
 *
 * The public site reads published CMS rows only. WordPress snapshots remain available
 * to import tooling, but an empty or unavailable CMS never makes the public readers
 * serve those files or bundled content instead.
 *
 * Each function keeps the name, arguments and returned shape of the `../wp` reader
 * it replaces, so rewiring a route is an import path. Where the CMS and legacy shapes cannot
 * agree — the numeric id a WordPress card carried — the shape is kept and the value
 * is documented at its maker.
 *
 * The decision is per kind, and for `list_items` it is per **list**.
 */
import { cache } from 'react';
import * as wp from '../wp';
import type { BranchView, PageCard, Query, WithSeo } from '../wp';
import { hrefPair } from '../wp/lang';
import { decodeEntities, firstParagraph, htmlToText, sanitizeHtmlBody } from '../wp/sanitize';
import { heroPhotos } from '../wp/hero';
import { readPublicHero } from '../hero/store';
import { HERO_DEFAULTS, type HeroDocument } from '../hero/types';
import { parseHomeProse, splitHomeProse, type BilingualHomeBlock } from '../wp/home-prose';
import type { PhotoSlot } from '../images';
import type { BranchDetail } from '../../data/branches';
import type { Article, ArticleCard, Bi, CategoryTerm, Lang, Offer, OfferDetail, PageContent, Paged, SeoMeta, ServiceCard, Settings } from '../wp/types';
import { db } from '../db';
import { SITE_URL } from '../site';
import { getLocalizedHref } from '../locale';
import { draftRow, hasPublished, publicRow, publicRows, type PublicRow, type PublicValue } from './published';
import { readMissingTextRule, resolveMissingText, type MissingText } from './language-fill';
import { teaserPair } from './teaser';
import { offerLiveOn } from './offer-services';
import type { ContentKind } from './kinds';
import { pageSlug, publicPathOf } from './paths';
import { SEO_SETTING_GROUP } from './settings-catalog';
import { getBrandProfile, getPromo } from './brand';
import type { BrandProfile } from './brand-shape';
import { livePromo, type Promo } from './promo-shape';
import { branchOfDoc, docBi, docBiAny, docBool, docStringPairs, docStrings, docStr, faqOfDoc, navOfDoc, resultStoryPointer, specialistOfDoc } from './list-docs';
import { faqData, type FaqItem } from '../../data/faq';
import { navItems, type NavItem } from '../../data/nav';
import { specialistsData, type Specialist } from '../../data/specialists';

export type { PageCard, Query, WithSeo };

// --- which rung answered ------------------------------------------------------

const logged = new Set<string>();
function note(source: 'db' | 'empty', kind: string, detail = ''): void {
  const key = `${source}:${kind}:${detail}`;
  if (logged.has(key)) return;
  if (logged.size > 100) logged.clear();
  logged.add(key);
  console.log(`[site] ${source.padEnd(8)} ${kind}${detail ? ` (${detail})` : ''}`);
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60);
}

/**
 * Read published CMS rows. An empty table or a failed database read returns an empty
 * value supplied by the caller; public content is never substituted from a snapshot.
 */
async function rung<T>(kind: ContentKind, fromDb: () => Promise<T>, empty: T): Promise<T> {
  try {
    if (await hasPublished(kind)) {
      note('db', kind);
      return await fromDb();
    }
    note('empty', kind, 'nothing published');
  } catch (err) {
    note('empty', kind, reason(err));
  }
  return empty;
}

// --- reading a row's values ---------------------------------------------------

function pair(row: PublicRow, name: string): Bi {
  const value: PublicValue | undefined = row.values[name];
  if (!value || value.kind !== 'bi') return { ar: '', en: '' };
  // No `|| value.en` here, and none belongs: the row arrived already answered by
  // `./language-fill.ts`, which fills the other locale only when the owner switched that
  // on. A reader that re-cross-filled would render English on `/ar` past a switch that
  // says it is off.
  return { ar: value.ar, en: value.en };
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

/**
 * A teaser in the language the page is rendered in.
 *
 * The rule itself is `./teaser.ts`, beside the reason it exists; this only lifts the two
 * pairs out of the row. `stripBuilderNoise()` and not the full render pipeline, because a
 * list asks this of every card and a teaser needs the words, not the markup.
 */
function excerptPair(row: PublicRow, bodyName: string): Bi {
  return teaserPair(htmlPair(row, 'excerpt'), pair(row, bodyName));
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

/** The `categories` rows an article's `category_id` can point at. One per render. */
const categoryIndex = cache(async (): Promise<Map<string, CategoryRef>> => {
  const [rows, missingText] = await Promise.all([
    db
      .selectFrom('categories')
      .select(['id', 'slug', 'name_ar', 'name_en'])
      .where('deleted_at', 'is', null)
      .execute(),
    readMissingTextRule(),
  ]);
  return new Map(rows.map((row) => [row.id, { slug: row.slug, name: resolveMissingText(missingText, { ar: row.name_ar, en: row.name_en }) }]));
});

function articleCard(row: PublicRow, index: number, categories: Map<string, CategoryRef>): ArticleCard {
  const title = decoded(pair(row, 'title'));
  const category = text(row, 'categoryId');
  const ref = category ? categories.get(category) : undefined;
  return {
    id: numericId(row, index),
    slug: row.key,
    title,
    excerpt: excerptPair(row, 'content'),
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
    [],
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
        // `card.excerpt` is already the Arabic sentence when the article has one: the
        // same rule `excerptPair()` applied to the body, so the card on the journal page
        // and the line under this headline cannot disagree about what the article says.
        content,
      };
      return { item: article, seo: publicSeo('article', card.slug, article.title, article.excerpt, article.image) };
    },
    null,
  );
}

/**
 * The article a console preview draws: the same `Article` the public page builds, from the
 * row's **draft** columns instead of its published twins.
 *
 * Deliberately not behind `rung()`: that gate answers "is anything of this kind published",
 * and the article somebody most needs to preview is the one they have never published. The
 * caller has already checked the console session and the grant, so this only reads.
 *
 * `articleCard()` and `body()` are the public page's own — the excerpt rule, the entity
 * decoding, the category name and the sanitizer are one implementation, which is what makes
 * the frame identical to the page rather than a second drawing of it that can drift.
 */
export async function getDraftArticle(id: string): Promise<Article | null> {
  const row = await draftRow('article', id);
  if (!row) return null;
  const card = articleCard(row, 0, await categoryIndex());
  return { ...card, content: body(row, 'content') };
}

export async function getCategories(): Promise<CategoryTerm[]> {
  try {
    const [rows, counts, missingText] = await Promise.all([
      db
        .selectFrom('categories')
        .select(['id', 'slug', 'name_ar', 'name_en'])
        .where('deleted_at', 'is', null)
        .where('enabled', '=', 1)
        .orderBy('position', 'asc')
        .execute(),
      articleCategoryCounts(),
      readMissingTextRule(),
    ]);
    if (rows.length) {
      note('db', 'category');
      return rows
        .map((row, index) => ({
          id: index + 1,
          slug: row.slug,
          name: resolveMissingText(missingText, { ar: row.name_ar, en: row.name_en }),
          count: counts.get(row.id) ?? 0,
        }))
        .sort((a, b) => b.count - a.count);
    }
    note('empty', 'category', 'no categories');
  } catch (err) {
    note('empty', 'category', reason(err));
  }
  return [];
}

/** How many published articles each category holds — the chip's count. One per render. */
const articleCategoryCounts = cache(async (): Promise<Map<string, number>> => {
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
});

// --- offers -------------------------------------------------------------------

/** An authored image entry: a URL, or an object with the alt text in both languages. */
function offerImages(value: unknown, name: Bi, missingText: MissingText): Array<{ src: string; alt: Bi }> {
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
    out.push({ src, alt: resolveMissingText(missingText, { ar: alt || name.ar, en: alt || name.en }) });
  }
  return out;
}

function offer(row: PublicRow, index: number): Offer {
  const name = decoded(pair(row, 'name'));
  const price = number(row, 'price') ?? 0;
  const regular = number(row, 'regularPrice') || price;
  const onSale = flag(row, 'onSale');
  const discount = onSale && regular > price && price > 0 ? Math.round(((regular - price) / regular) * 100) : null;
  const images = offerImages(json(row, 'images'), name, row.missingText);
  return {
    id: numericId(row, index),
    slug: row.key,
    name,
    excerpt: excerptPair(row, 'body'),
    price,
    regularPrice: regular,
    currency: text(row, 'currency') || 'EGP',
    onSale,
    discountPercent: discount,
    images,
    image: images[0]?.src ?? null,
    imageAlt: images[0]?.alt ?? { ar: '', en: '' },
    // The stored document, handed on as it was written: a reader asks
    // `offerServiceScope()` rather than re-deriving the meaning of an array here, so the
    // console, this page and the lead endpoint cannot drift apart. `null` is the column
    // being NULL — never configured — which is not the same answer as `[]`.
    services: arrayOfStrings(json(row, 'applicableServices')),
    validFrom: text(row, 'startsAt'),
    validUntil: text(row, 'endsAt'),
    // Both languages carry the same unprefixed path for compatibility with existing
    // offer links; `decideRoute()` renders an Arabic page for it either way.
    href: { ar: publicPathOf('offer', row.key)!, en: publicPathOf('offer', row.key)! },
  };
}

/** A JSON column as a list of strings, or null when it is not one — see ./offer-services.ts. */
function arrayOfStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : null;
}

/**
 * Whether a published, enabled offer may be shown today.
 *
 * `enabled` is the owner's switch and the window is the offer's own dates: a row whose
 * `ends_at` passed yesterday is invisible on the site even though it still sits in the
 * console, because a patient who books what the clinic stopped running loses an
 * appointment on the phone. Both ends are inclusive and a missing end never expires.
 */
function offerIsLive(row: PublicRow): boolean {
  return flag(row, 'enabled') && offerLiveOn(text(row, 'startsAt'), text(row, 'endsAt'));
}

/**
 * Offers in the language being rendered. One CMS row carries both locales, so the
 * locale argument is retained for compatibility with existing callers.
 */
export async function getAllOffers(_lang: Lang = 'en'): Promise<Offer[]> {
  void _lang;
  return rung(
    'offer',
    async () => (await publicRows('offer')).filter(offerIsLive).map(offer),
    [],
  );
}

export async function getOffers(q: Query = {}, lang: Lang = 'en'): Promise<Paged<Offer>> {
  let offers = await getAllOffers(lang);
  if (q.search) {
    offers = offers.filter((offer) => matches(q.search, haystack(offer.name.ar, offer.name.en, offer.excerpt.ar, offer.excerpt.en)));
  }
  return wp.paginate(offers, q.page, q.perPage);
}

export async function getOffer(slug: string, _lang: Lang = 'en'): Promise<WithSeo<OfferDetail> | null> {
  void _lang;
  return rung(
    'offer',
    async () => {
      const row = await publicRow('offer', lookupKey(slug));
      if (!row || !offerIsLive(row)) return null;
      const detail = { ...offer(row, 0), html: body(row, 'body') };
      return { item: detail, seo: publicSeo('offer', detail.slug, detail.name, detail.excerpt, detail.image) };
    },
    null,
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
    [],
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
    null,
  );
}

/**
 * A page's heading as its authors write it, for the hero title of the matching
 * route.
 */
export async function getPageTitle(slug: string, _authored?: Bi): Promise<Bi> {
  void _authored;
  const card = (await getAllPages()).find((page) => page.slug === pageSlug(slug));
  return card?.title ?? { ar: '', en: '' };
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
// --- import sources -----------------------------------------------------------
//
// These are used by import tooling only. Public list readers below never call them.
export async function getSourceBranches(): Promise<BranchDetail[]> {
  return wp.getBranchList();
}

export function getSourceSpecialists(): Specialist[] {
  return specialistsData;
}

export function getSourceFaq(): FaqItem[] {
  return faqData;
}

export function getSourceNav(): NavItem[] {
  return navItems;
}

export async function getSourceServiceCards(): Promise<ServiceCard[]> {
  return wp.getServiceCards();
}

async function listRung<T>(listKey: string, fromDb: () => Promise<T>, empty: T): Promise<T> {
  try {
    if (await hasPublished('list_item', { listKey })) {
      note('db', `list ${listKey}`);
      return await fromDb();
    }
    note('empty', `list ${listKey}`, 'nothing published');
  } catch (err) {
    note('empty', `list ${listKey}`, reason(err));
  }
  return empty;
}

function documentOf(row: PublicRow): Record<string, unknown> | null {
  const value = row.values.data;
  if (!value || value.kind !== 'json' || !value.value || typeof value.value !== 'object') return null;
  return value.value as Record<string, unknown>;
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
  return doc ? branchOfDoc(doc, row.key) : null;
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
    [],
  );
}

export async function getBranches(): Promise<BranchView[]> {
  return (await getBranchList()).map(toBranchView);
}

// specialists

/**
 * The medical team. `branches` are branch ids, so a card links to the same branch rows
 * the branches screen edits; an id that names no branch simply renders no link.
 */
export async function getSpecialistList(): Promise<Specialist[]> {
  return listRung(
    'specialists',
    async () =>
      (await publicRows('list_item', { listKey: 'specialists' }))
        .filter((row) => flag(row, 'enabled'))
        .map((row) => {
          const doc = documentOf(row);
          return doc ? specialistOfDoc(doc, row.key) : null;
        })
        .filter((specialist): specialist is Specialist => specialist !== null),
    [],
  );
}

// questions

/** The questions page, grouped by `category` in the client. */
export async function getFaqList(): Promise<FaqItem[]> {
  return listRung(
    'faq',
    async () =>
      (await publicRows('list_item', { listKey: 'faq' }))
        .filter((row) => flag(row, 'enabled'))
        .map((row) => {
          const doc = documentOf(row);
          return doc ? faqOfDoc(doc, row.key) : null;
        })
        .filter((item): item is FaqItem => item !== null),
    [],
  );
}

// navigation

/**
 * The header and footer menu. The booking button is not a line in it: the button's
 * words are the site's own, not a link a person adds or removes.
 */
export async function getNavList(): Promise<NavItem[]> {
  return listRung(
    'nav',
    async () =>
      (await publicRows('list_item', { listKey: 'nav' }))
        .filter((row) => flag(row, 'enabled'))
        .map((row) => {
          const doc = documentOf(row);
          return doc ? navOfDoc(doc) : null;
        })
        .filter((item): item is NavItem => item !== null),
    [],
  );
}

// services

/**
 * A service card. A row with no link of its own points the reader at `/services`.
 *
 * The name is read as `name` first and `title` second, in either shape a document holds
 * a value in. The service form writes `name_ar`, a row seeded before that form existed
 * carries a nested `title`, and a reader that understood only one of the two showed no
 * services at all.
 *
 * The link is one value, written once by the owner, and split into the two locales here
 * by the site's own rule — the same rule that makes the canonical URL — so a card cannot
 * be published at one address and linked from another.
 */
function serviceCardOf(row: PublicRow, index: number): ServiceCard | null {
  const doc = documentOf(row);
  if (!doc) return null;
  const title = docBiAny(doc, ['name', 'title']);
  if (!title.ar && !title.en) return null;
  const href = docBi(doc, 'href');
  const link = href.ar || href.en;
  return {
    id: numericId(row, index),
    slug: row.key,
    title,
    intro: docBi(doc, 'intro'),
    image: docStr(doc, 'image') || null,
    href: link ? { ar: getLocalizedHref(link, 'ar'), en: getLocalizedHref(link, 'en') } : hrefPair('services'),
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
    [],
  );
}

// --- result stories -----------------------------------------------------------

/**
 * What the console typed onto one result row, and the article it names — when it names one.
 *
 * A row may stand alone: an owner who writes a title and uploads the two pictures has made a
 * result, and needs no journal article to have done so. `card` is then null, and `headline` is
 * the row's own name. `key` is the row's identity either way, because the page cannot hang its
 * enlarged view on an article that is not there.
 *
 * `pair` is the comparison, and it is only a comparison when both halves were uploaded: a
 * card that showed one picture labelled "after" would promise a before the owner never
 * took. So the half pair is dropped here, in the data, rather than hidden in a stylesheet —
 * every reader of this shape then draws either a real before/after or what the row holds,
 * and never a half of either. Each half carries the description written for it, because the
 * two pictures show different things and one sentence cannot name both.
 *
 * `area` and `sessions` are the two chips beside the pictures: what was treated, and how many
 * visits it took. Both state what the clinic did, never what a visitor is promised.
 *
 * `showOnHome` is the owner's invitation to the home page. It asks for one thing the row cannot
 * do on its own — `pair` must exist — which is why the home reader checks both and `/results`
 * checks neither.
 *
 * A row the import wrote holds only the phrases that made it a story, so every other field
 * here is empty for it. Nothing is invented to fill a gap the dashboard did not publish.
 */
export interface ResultStory {
  key: string;
  card: ArticleCard | null;
  phrases: string[];
  /** the owner's headline, already fallen back to the article's own title. */
  headline: Bi;
  pair: { before: string; after: string; beforeAlt: Bi; afterAlt: Bi } | null;
  /** the body part that was treated, as the owner names it. */
  area: Bi;
  /** how many sessions the case took, as free text — "٤ جلسات", "after 6 sessions". */
  sessions: Bi;
  caption: Bi;
  /** the longer text, shown only in the enlarged view. */
  note: Bi;
  /** the service the row names, by its live name and link. */
  service: { name: Bi; href: Bi } | null;
  /** whether the owner asked for this case on the home page. */
  showOnHome: boolean;
}

/**
 * Everything a row states before its article has been found.
 *
 * This is `ResultStory` one step earlier, with one extra: the single description older rows
 * hold for the pair. The console now writes a description per picture, and the imported rows
 * and the residue an operator edited by hand wrote one for both — so the shared one is what
 * a half with no words of its own falls back to, before the headline falls back to itself.
 */
interface ResultDetail {
  headline: Bi;
  pair: { before: string; after: string; beforeAlt: Bi; afterAlt: Bi; alt: Bi } | null;
  area: Bi;
  sessions: Bi;
  caption: Bi;
  note: Bi;
  service: { name: Bi; href: Bi } | null;
  showOnHome: boolean;
}

interface ResultSelection {
  key: string;
  pointer: string;
  detail: ResultDetail;
  phrases: string[];
}

function resultSelectionOf(row: PublicRow, services: Map<string, ServiceCard>): ResultSelection {
  const doc = documentOf(row) ?? {};
  const named = docStrings(doc, 'service');
  const service = named.length > 0 ? services.get(named[0]) : undefined;
  const before = docStr(doc, 'before');
  const after = docStr(doc, 'after');
  return {
    key: row.key,
    pointer: resultStoryPointer(doc, row.key),
    phrases: docStringPairs(doc, 'phrases').en,
    detail: {
      headline: docBi(doc, 'title'),
      pair:
        before && after
          ? { before, after, beforeAlt: docBi(doc, 'beforeAlt'), afterAlt: docBi(doc, 'afterAlt'), alt: docBi(doc, 'alt') }
          : null,
      area: docBi(doc, 'area'),
      sessions: docBi(doc, 'sessions'),
      caption: docBi(doc, 'caption'),
      note: docBi(doc, 'note'),
      service: service ? { name: service.title, href: service.href } : null,
      showOnHome: docBool(doc, 'showOnHome'),
    },
  };
}

/** The first of these that says anything, whole: a per-picture description, the shared one, the name. */
function wordsOf(...candidates: Bi[]): Bi {
  return candidates.find((candidate) => candidate.ar !== '' || candidate.en !== '') ?? { ar: '', en: '' };
}

/**
 * The rows that claim a story, in the order the console put them.
 *
 * Membership used to be a map keyed by the WordPress post id, which is exactly why a result
 * added in the console could never appear: its row carries no number. A row now points at an
 * article by whichever name it holds — and holds no name at all when it stands alone — while
 * the list keeps the order its author set: the `position` column the import wrote and the old
 * reader ignored.
 *
 * Imported rows can name a post without carrying additional case details.
 */
async function resultSelections(): Promise<ResultSelection[]> {
  return listRung(
    'results',
    async () => {
      const services = new Map((await getServiceCards()).map((card) => [card.slug, card]));
      return (await publicRows('list_item', { listKey: 'results' }))
        .filter((row) => flag(row, 'enabled'))
        .map((row) => resultSelectionOf(row, services));
    },
    [],
  );
}

/**
 * The page's stories: each row drawn from what it states, plus its article when it names one.
 *
 * A post id resolves by id first because that is what it is; a slug only ever resolves by
 * slug, so an id-shaped slug cannot steal another row's article. A row whose pointer names an
 * article that is gone is still a story — its title and its pictures are the owner's own
 * words, and losing a post must not delete a published result. Two rows that claim one
 * article render it once, in the earlier row's place: the list has never been a second copy
 * of the journal.
 *
 * A row with neither an article nor a headline is the one thing dropped: it has no name, and
 * a card cannot say "here is a result" about nothing.
 */
async function buildResultStories(): Promise<ResultStory[]> {
  const [selections, cards] = await Promise.all([resultSelections(), getAllArticles()]);
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  const byLegacyId = new Map(cards.map((card) => [String(card.id), card]));
  const stories: ResultStory[] = [];
  const claimed = new Set<string>();
  for (const selection of selections) {
    const numeric = /^\d+$/.test(selection.pointer);
    const card =
      selection.pointer === ''
        ? null
        : numeric
          ? byLegacyId.get(selection.pointer) ?? bySlug.get(selection.pointer) ?? null
          : bySlug.get(selection.pointer) ?? null;
    const typed = selection.detail;
    const named = typed.headline.ar !== '' || typed.headline.en !== '';
    if (!card && !named) continue;
    if (card) {
      if (claimed.has(card.slug)) continue;
      claimed.add(card.slug);
    }
    const headline = card && !named ? card.title : typed.headline;
    stories.push({
      key: selection.key,
      card,
      phrases: selection.phrases,
      ...typed,
      // A headline the owner never typed is the article's own, and a picture nobody described
      // is read out as whatever the case is titled — the screen reader still gets a sentence.
      headline,
      pair: typed.pair
        ? {
            before: typed.pair.before,
            after: typed.pair.after,
            beforeAlt: wordsOf(typed.pair.beforeAlt, typed.pair.alt, headline),
            afterAlt: wordsOf(typed.pair.afterAlt, typed.pair.alt, headline),
          }
        : null,
    });
  }
  return stories;
}

export async function getResultStories(q: Query = {}): Promise<Paged<ResultStory>> {
  return wp.paginate(await buildResultStories(), q.page, q.perPage);
}

/**
 * Every story the rows claim, in the console's order, unpaged.
 *
 * `/results` paginates because a visitor walks a list; a page that resolves a *relationship*
 * needs the whole file, because the case a service names may sit on any page of it.
 */
export async function getAllResultStories(): Promise<ResultStory[]> {
  return buildResultStories();
}

/**
 * The cases the home page is allowed to compare.
 *
 * Two conditions, and only one of them is something the owner can tick: the row must ask for
 * the home page, and it must actually hold a pair. The second is not a courtesy — one picture
 * dragged over itself is a fake result, and the site would be publishing a transformation
 * nobody took a photograph of. A case that asks for Home with a half pair therefore appears on
 * `/results` and never on the home page, which is what the editor's hint promises.
 *
 * Order is the console's own: the same `position` the results page reads, so moving a case up
 * moves it up in both places. At most `HOME_CASE_LIMIT` of them travel — the band is a taster,
 * and `/results` is where the rest of the file lives.
 */
const HOME_CASE_LIMIT = 6;

export async function getHomeResultCases(): Promise<ResultStory[]> {
  const stories = await buildResultStories();
  return stories.filter((story) => story.showOnHome && story.pair !== null).slice(0, HOME_CASE_LIMIT);
}

// --- testimonials -----------------------------------------------------------------

export interface ChatMessage {
  from: 'patient' | 'clinic';
  text: Bi;
  time: Bi;
}

interface TestimonialBase {
  key: string;
  name: Bi;
  avatar: string | null;
  quote: Bi;
  rating: number | null;
  service: { name: Bi; href: Bi } | null;
}

export interface ChatTestimonial extends TestimonialBase {
  format: 'chat';
  day: Bi;
  messages: ChatMessage[];
  voice: string | null;
}

export interface VideoTestimonial extends TestimonialBase {
  format: 'video';
  poster: string | null;
  /** an uploaded file, played in a `<video>` */
  src: string | null;
  /** else a YouTube id, played in its embed */
  youtube: string | null;
}

export type Testimonial = ChatTestimonial | VideoTestimonial;

/** `youtu.be/x`, `youtube.com/watch?v=x`, `/shorts/x`, `/embed/x` — the id, or nothing. */
export function youtubeIdOf(link: string): string | null {
  const text = link.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)?.[1] ?? null;
  }
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

function chatMessagesOf(doc: Record<string, unknown>): ChatMessage[] {
  const raw = doc.messages;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): ChatMessage[] => {
    if (!entry || typeof entry !== 'object') return [];
    const cell = entry as Record<string, unknown>;
    const text = docBi(cell, 'text');
    if (!text.ar && !text.en) return [];
    return [{ from: docStr(cell, 'from') === 'clinic' ? 'clinic' : 'patient', text, time: docBi(cell, 'time') }];
  });
}

/**
 * What patients said, as the console's testimonials list publishes it.
 *
 * A row is drawn only when it has something to show: a chat needs a message or a voice note,
 * a video needs a file or a YouTube link. Everything else — a row whose upload never finished,
 * a link that is not YouTube — is left out rather than drawn as an empty phone, and with no row
 * left the proofs band does not render at all.
 */
export async function getTestimonials(): Promise<Testimonial[]> {
  return listRung(
    'testimonials',
    async () => {
      const services = new Map((await getServiceCards()).map((card) => [card.slug, card]));
      return (await publicRows('list_item', { listKey: 'testimonials' }))
        .filter((row) => flag(row, 'enabled'))
        .flatMap((row): Testimonial[] => {
          const doc = documentOf(row);
          if (!doc) return [];
          const named = docStrings(doc, 'service');
          const card = named.length > 0 ? services.get(named[0]) : undefined;
          const rating = Number(doc.rating);
          const base: TestimonialBase = {
            key: row.key,
            name: docBi(doc, 'name'),
            avatar: docStr(doc, 'avatar') || null,
            quote: docBi(doc, 'quote'),
            rating: Number.isFinite(rating) && rating > 0 ? Math.min(5, Math.round(rating)) : null,
            service: card ? { name: card.title, href: card.href } : null,
          };
          if (!base.name.ar && !base.name.en) return [];

          if (docStr(doc, 'format') === 'video') {
            const src = docStr(doc, 'video') || null;
            const youtube = src ? null : youtubeIdOf(docStr(doc, 'videoLink'));
            if (!src && !youtube) return [];
            return [{ ...base, format: 'video', poster: docStr(doc, 'poster') || null, src, youtube }];
          }

          const messages = chatMessagesOf(doc);
          const voice = docStr(doc, 'voice') || null;
          if (messages.length === 0 && !voice) return [];
          return [{ ...base, format: 'chat', day: docBi(doc, 'day'), messages, voice }];
        });
    },
    [],
  );
}

export interface LandingPage {
  key: string;
  headline: Bi;
  subhead: Bi;
  image: string | null;
  /** One selling point per line, per language. */
  bullets: { ar: string[]; en: string[] };
  offers: string[];
  services: string[];
  faq: string[];
  cta: Bi;
  indexed: boolean;
}

/** One ad landing page by its address, or null when it does not exist or is switched off. */
export async function getLandingPage(key: string): Promise<LandingPage | null> {
  return listRung(
    'landing',
    async () => {
      const row = (await publicRows('list_item', { listKey: 'landing' })).find((candidate) => candidate.key === key);
      if (!row || !flag(row, 'enabled')) return null;
      const doc = documentOf(row);
      if (!doc) return null;
      const headline = docBi(doc, 'headline');
      if (!headline.ar && !headline.en) return null;
      const lines = (text: string) => text.split(/\r?\n/).map((line) => line.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
      const bullets = docBi(doc, 'bullets');
      return {
        key: row.key,
        headline,
        subhead: docBi(doc, 'subhead'),
        image: docStr(doc, 'image') || null,
        bullets: { ar: lines(bullets.ar), en: lines(bullets.en) },
        offers: docStrings(doc, 'offers'),
        services: docStrings(doc, 'services'),
        faq: docStrings(doc, 'faq'),
        cta: docBi(doc, 'cta'),
        indexed: docBool(doc, 'indexed'),
      };
    },
    null,
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
 * Missing CMS values stay blank; a missing setting is never filled from local
 * configuration.
 */
const SETTING_GROUP = 'site';

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

/** One group's saved words per render: the settings screen and the clinic numbers read it. */
const savedGroup = cache(async (group: string): Promise<Map<string, string>> => {
  const rows = await db
    .selectFrom('settings')
    .select(['setting_key', 'value'])
    .where('group_name', '=', group)
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
});

const savedSettings = () => savedGroup(SETTING_GROUP);

/**
 * The site's words come from CMS settings. The two counted fields remain derived from
 * CMS offers and branches.
 *
 * `lang` moves `name` — the two identity rows are one per language — but not `hours`,
 * which no page renders today. A field with no surface is reported, not wired to a
 * slot the owner never asked for.
 */
export async function getSettings(lang: Lang = 'en'): Promise<Settings> {
  const [offers, branches, saved] = await Promise.all([
    getOffers({ perPage: 1 }, lang),
    getBranches(),
    savedSettings().then(
      (values) => {
        if (values.size) note('db', 'settings', `${values.size} key(s)`);
        else note('empty', 'settings', 'nothing saved');
        return values;
      },
      (err: unknown) => {
        note('empty', 'settings', reason(err));
        return new Map<string, string>();
      },
    ),
  ]);
  return {
    name: brandFrom(saved)[lang],
    tagline: saved.get('tagline') ?? '',
    currency: offers.items[0]?.currency ?? '',
    phone: saved.get('phone') ?? '',
    whatsapp: saved.get('whatsapp') ?? '',
    email: saved.get('email') ?? '',
    hours: saved.get('hours') ?? '',
    branches: branches.length,
  };
}

export interface ClinicWords {
  phone: string;
  whatsapp: string;
  whatsappUrl: string;
  /** Logo, social accounts, WhatsApp opening message and footer trust details. */
  brand: BrandProfile;
  /** The announcement line and exit prompt, already filtered to what is live today. */
  promo: Promo;
}

/**
 * The two numbers the site dials and the link it opens, for the client tree.
 *
 * `getSettings` already answered from these rows, but nothing on a public page read it:
 * the header, the footer, the contact page, the call-to-action band and the floating
 * buttons each imported `clinicData`, which is built from `config/site.ts` at module
 * load. An operator typing a new number into Settings wrote a row nothing rendered.
 *
 * A missing CMS value stays blank; public contact details are never taken from config.
 */
export async function getClinicWords(): Promise<ClinicWords> {
  let saved = new Map<string, string>();
  try {
    saved = await savedSettings();
    if (saved.size) note('db', 'clinic', `${saved.size} key(s)`);
  } catch (err: unknown) {
    note('empty', 'clinic', reason(err));
  }
  const phone = saved.get('phone') ?? '';
  const whatsapp = saved.get('whatsapp') ?? '';
  return {
    phone,
    whatsapp,
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : '',
    brand: await getBrandProfile(),
    promo: livePromo(await getPromo()),
  };
}

export interface BrandWords {
  ar: string;
  en: string;
}

/** The rule both reads share: per-language row, then the older single row. */
function brandFrom(saved: Map<string, string>): BrandWords {
  const legacy = saved.get('name');
  return {
    ar: saved.get('name.ar') ?? legacy ?? '',
    en: saved.get('name.en') ?? legacy ?? '',
  };
}

/**
 * The clinic's own name, as the identity card saved it, in both languages at once.
 *
 * The brand had one row and no reader: the name in `<title>`, `og:site_name` and the
 * JSON-LD `name` came from the config file, so the field that offered to change it
 * wrote a row nothing rendered. It needs two rows because the name is not the same
 * word in both languages — `name.ar` answers for the Arabic site, `name.en` for English.
 *
 * The single `name` row an operator may have saved before the split still answers for
 * both, so a saved name is never silently handed back to the file.
 */
export async function getBrandWords(): Promise<BrandWords> {
  try {
    return brandFrom(await savedSettings());
  } catch (err: unknown) {
    note('empty', 'brand', reason(err));
    return brandFrom(new Map());
  }
}

export interface SiteMeta {
  title: string;
  description: string;
  /** The `google-site-verification` value, or null when it has never been saved. */
  verification: string | null;
}

/**
 * Site metadata is CMS-owned; missing or unreadable settings remain empty.
 */
export async function getSiteMeta(lang: Lang): Promise<SiteMeta> {
  let saved = new Map<string, string>();
  try {
    saved = await savedGroup(SEO_SETTING_GROUP);
  } catch (err: unknown) {
    note('empty', 'site metadata', reason(err));
  }
  return {
    title: saved.get(`title.${lang}`) ?? '',
    description: saved.get(`description.${lang}`) ?? '',
    verification: saved.get('verification.google') ?? null,
  };
}

// --- the homepage's builder blocks ----------------------------------------------

/**
 * Three of the homepage's blocks are not fields. Its hero slider and its two prose
 * rows are parsed out of the page's builder markup, whose `rs-slide` and `<br>` tags a
 * renderer drops — so this takes the body **raw**, the counterpart of `body()`, and
 * nothing it reads is ever sent to a browser as HTML.
 *
 * The page kind is read from the CMS only, so a missing `home` row means no hero or copy.
 */
async function rawHomeBodies(): Promise<{ en: string; ar: string }> {
  return rung(
    'page',
    async () => {
      const row = await publicRow('page', 'home');
      const content = row ? pair(row, 'content') : null;
      return { en: content?.en ?? '', ar: content?.ar ?? '' };
    },
    { en: '', ar: '' },
  );
}

/** Homepage hero backgrounds parsed from the published CMS page. */
export async function getHeroPhotos(): Promise<PhotoSlot[]> {
  return heroPhotos((await rawHomeBodies()).en);
}

/**
 * The slider the console edits, with the schedule already applied.
 */
export async function getHomeHero(): Promise<HeroDocument> {
  try {
    return await readPublicHero();
  } catch (err: unknown) {
    note('empty', 'hero', reason(err));
    return { slides: [], settings: { ...HERO_DEFAULTS } };
  }
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
  if (!intro) return { title: { ar: '', en: '' }, lead: { ar: '', en: '' } };
  const lead = intro.paragraphs.find((p) => p.en);
  return {
    title: intro.heading,
    lead: lead ?? { ar: '', en: '' },
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
