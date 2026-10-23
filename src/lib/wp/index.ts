import { DEFAULT_PER_PAGE, MAX_PER_PAGE, PAGE_IDS, logSource } from "./config";
import {
  readSnapshot,
  snapshotMedia,
  snapshotMeta,
  type SnapshotName,
} from "./snapshot";
import { resolveSeo } from "./seo";
import {
  mapArticle,
  mapArticleCard,
  mapCategory,
  mapOffer,
  mapPage,
  mapServiceCards,
  offerHtml,
  type MapContext,
} from "./mappers";
import { htmlToText, decodeEntities } from "./sanitize";
import { hrefPair } from "./lang";
import type {
  Article,
  ArticleCard,
  Bi,
  CategoryTerm,
  Offer,
  OfferDetail,
  PageContent,
  Paged,
  SeoMeta,
  ServiceCard,
  WCStoreProduct,
  WPPost,
  WPTerm,
  Lang,
} from "./types";
import type { BranchDetail } from "@/data/branches";
import type { PhotoSlot } from "@/lib/images";
import { mergeBranches, parseOffices } from "./branches";
import { heroPhotos } from "./hero";
import { parseHomeProse, splitHomeProse, type BilingualHomeBlock } from "./home-prose";
import { homeIntroFallback } from "@/data/about";

export interface Query {
  page?: number;
  perPage?: number;
  category?: string;
  search?: string;
}

export interface WithSeo<T> {
  item: T;
  seo: { en: SeoMeta; ar: SeoMeta | null };
}

function clampPage(page?: number, perPage?: number) {
  const per = Math.max(1, Math.min(MAX_PER_PAGE, perPage || DEFAULT_PER_PAGE));
  return { per, requested: Math.max(1, page || 1) };
}

/** Paginate an already-materialised (bilingual) list in memory. */
export function paginate<T>(items: T[], page?: number, perPage?: number): Paged<T> {
  const { per, requested } = clampPage(page, perPage);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / per));
  const current = Math.min(requested, totalPages);
  const start = (current - 1) * per;
  return {
    items: items.slice(start, start + per),
    page: current,
    perPage: per,
    total,
    totalPages,
    hasMore: current < totalPages,
  };
}

function indexById<T extends { id: number }>(arr: T[]): Map<number, T> {
  const m = new Map<number, T>();
  for (const x of arr) m.set(x.id, x);
  return m;
}

function haystack(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}
function matches(term: string | undefined, text: string): boolean {
  if (!term) return true;
  return text.includes(term.trim().toLowerCase());
}
// ---------------------------------------------------------------------------
// Snapshot selection
//
// BK-7.3 took the live WordPress origin out of this file: every read below is
// the committed `data/wp/*.json` snapshot, which is what a page render waits on
// — a local file, in the build and at runtime alike. The snapshot is the rung
// the site falls back to until BK-6.3 hands that kind to the database, so the
// site answers from it for the same reason it always did: the alternative was
// the client's production host, and a stalled origin is a stalled page.
// The one tool that still speaks to WordPress is `scripts/sync-wp.mjs`, run by
// hand to produce a new snapshot folder.
// ---------------------------------------------------------------------------

async function selectList<T>(name: SnapshotName, lang: Lang): Promise<T[]> {
  const rows = readSnapshot<T[]>(name, lang) ?? [];
  logSource(name, lang, `${rows.length} rows`);
  return rows;
}

async function selectBySlug<T extends { slug: string }>(
  listName: SnapshotName,
  contentName: SnapshotName,
  lang: Lang,
  slug: string,
): Promise<T | null> {
  const rows = readSnapshot<T[]>(contentName, lang) || readSnapshot<T[]>(listName, lang) || [];
  const hit = rows.find((r) => r.slug === slug) || null;
  logSource(contentName, lang, hit ? slug : `missing ${slug}`);
  return hit;
}

/** Media + taxonomy lookups so list rows can be mapped without `_embed`. */
async function buildContext(rows: WPPost[]): Promise<MapContext> {
  const media = snapshotMedia();
  const missing = new Set<number>();
  for (const r of rows) if (r.featured_media && !media.has(r.featured_media)) missing.add(r.featured_media);
  // A media id the snapshot never captured stays unresolved: the mappers render
  // that card without a cover rather than paying for a round trip to WordPress.
  if (missing.size) logSource("media", "en", `${missing.size} unresolved`);

  const [termsEn, termsAr] = await Promise.all([
    selectList<WPTerm>("categories", "en"),
    selectList<WPTerm>("categories", "ar"),
  ]);
  return { media, termsEn: indexById(termsEn), termsAr: indexById(termsAr) };
}

/** English rows are authoritative; Arabic rows (same ids) supply the other language. */
async function pairLists<T extends { id: number }>(
  name: SnapshotName,
): Promise<{ en: T[]; ar: Map<number, T> }> {
  const [en, ar] = await Promise.all([selectList<T>(name, "en"), selectList<T>(name, "ar")]);
  return { en, ar: indexById(ar) };
}

// ---------------------------------------------------------------------------
// Branches (config/static per docs/inventory.md)
//
// `getSettings` used to live here. It was an aggregate of the config file plus two
// counts, never a WordPress read, so it now belongs to the site's read path
// (`lib/content/site.ts`), where its editable words can come from the settings table.
// ---------------------------------------------------------------------------

export interface BranchView {
  id: string;
  name: Bi;
  area: Bi;
  address: Bi;
  phone: string;
  image: string | null;
  intro: Bi;
  features: { ar: string[]; en: string[] };
  landmark: Bi;
}

/**
 * The three branches, with the homepage office blocks (name, address, phone and
 * photo) on top of the authored rows. See `lib/wp/branches.ts` for what each
 * side contributes.
 */
export async function getBranchList(): Promise<BranchDetail[]> {
  let html = "";
  try {
    html = (await getPage("home"))?.item.html.en || "";
  } catch {
    // A WordPress outage must not take the whole layout down: the rendered
    // branches then fall back to the authored rows, which is what the snapshot
    // would have shown anyway.
    html = "";
  }
  return mergeBranches(parseOffices(html));
}

function toView(b: BranchDetail): BranchView {
  return {
    id: b.id,
    name: b.name,
    area: b.area,
    address: b.address,
    phone: b.phone,
    image: b.image?.src ?? null,
    intro: b.intro,
    features: b.features,
    landmark: b.landmark,
  };
}

export async function getBranches(): Promise<BranchView[]> {
  return (await getBranchList()).map(toView);
}

export async function getBranch(idOrSlug: string): Promise<BranchView | null> {
  const found = (await getBranchList()).find((b) => b.id === idOrSlug);
  return found ? toView(found) : null;
}

/** How current the committed snapshot is — surfaced by /api/v1/settings. */
export function getSnapshotInfo() {
  const meta = snapshotMeta();
  return meta
    ? { generatedAt: meta.generatedAt, counts: meta.counts, origin: meta.origin }
    : { generatedAt: null, counts: {}, origin: null };
}

// ---------------------------------------------------------------------------
// Journal (WP posts)
// ---------------------------------------------------------------------------

export async function getAllArticles(): Promise<ArticleCard[]> {
  const { en, ar } = await pairLists<WPPost>("posts-list");
  const ctx = await buildContext([...en, ...ar.values()]);
  return en
    .map((p) => mapArticleCard(p, ar.get(p.id), ctx))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getPosts(q: Query = {}): Promise<Paged<ArticleCard>> {
  let cards = await getAllArticles();
  if (q.category) cards = cards.filter((c) => c.categorySlug === q.category);
  if (q.search) {
    cards = cards.filter((c) =>
      matches(q.search, haystack(c.title.ar, c.title.en, c.excerpt.ar, c.excerpt.en)),
    );
  }
  return paginate(cards, q.page, q.perPage);
}

export async function getPost(slug: string): Promise<WithSeo<Article> | null> {
  const decoded = safeDecode(slug);
  const [enP, arP] = await Promise.all([
    selectBySlug<WPPost>("posts-list", "posts", "en", decoded),
    selectBySlug<WPPost>("posts-list", "posts", "ar", decoded),
  ]);
  if (!enP) return null;
  const ctx = await buildContext(arP ? [enP, arP] : [enP]);
  const article = mapArticle(enP, arP, ctx);
  const seo = await buildSeo(enP.link, arP?.link ?? null, article.title, article.excerpt, article.image);
  return { item: article, seo };
}

// ---------------------------------------------------------------------------
// Pages (WP static content)
// ---------------------------------------------------------------------------

export interface PageCard {
  id: number;
  slug: string;
  title: Bi;
  excerpt: Bi;
  modified: string;
  href: Bi;
}

export async function getAllPages(): Promise<PageCard[]> {
  const { en, ar } = await pairLists<WPPost>("pages-list");
  return en.map((p) => {
    const a = ar.get(p.id);
    return {
      id: p.id,
      slug: p.slug,
      modified: p.modified || p.date,
      title: {
        ar: a ? decodeEntities(a.title.rendered) : decodeEntities(p.title.rendered),
        en: decodeEntities(p.title.rendered),
      },
      excerpt: {
        ar: a ? htmlToText(a.excerpt.rendered || "") : "",
        en: htmlToText(p.excerpt.rendered || ""),
      },
      href: hrefPair(p.slug),
    };
  });
}

export async function getPages(q: Query = {}): Promise<Paged<PageCard>> {
  const cards = await getAllPages();
  const filtered = q.search
    ? cards.filter((c) => matches(q.search, haystack(c.title.ar, c.title.en, c.excerpt.en)))
    : cards;
  return paginate(filtered, q.page, q.perPage);
}

export async function getPage(slug: string): Promise<WithSeo<PageContent> | null> {
  const decoded = safeDecode(slug);
  const [enP, arP] = await Promise.all([
    selectBySlug<WPPost>("pages-list", "pages", "en", decoded),
    selectBySlug<WPPost>("pages-list", "pages", "ar", decoded),
  ]);
  if (!enP) return null;
  const page = mapPage(enP, arP);
  const seo = await buildSeo(enP.link, arP?.link ?? null, page.title, { ar: "", en: "" }, null);
  return { item: page, seo };
}

/**
 * A page body before sanitizing. The data team builds some sections with a page
 * builder whose tags `sanitizeHtmlBody` discards (the homepage slider), so those
 * are read from the original rendered body. Never sent to the browser as HTML —
 * only parsed into images or text by a dedicated reader.
 */
async function getRawPageHtml(slug: string, lang: Lang = "en"): Promise<string> {
  const row = await selectBySlug<WPPost>("pages-list", "pages", lang, safeDecode(slug));
  return row?.content?.rendered || "";
}

/** Homepage hero backgrounds: the WordPress slider, or the authored photo if absent. */
export async function getHeroPhotos(): Promise<PhotoSlot[]> {
  let raw = "";
  try {
    raw = await getRawPageHtml("home");
  } catch {
    raw = "";
  }
  return heroPhotos(raw);
}

/** The homepage's own prose rows, read from the un-sanitized builder body. */
async function readHomeProse(): Promise<{ intro: BilingualHomeBlock | null; sections: BilingualHomeBlock[] }> {
  try {
    const [en, ar] = await Promise.all([getRawPageHtml("home", "en"), getRawPageHtml("home", "ar")]);
    return splitHomeProse(parseHomeProse(en, ar));
  } catch {
    return { intro: null, sections: [] };
  }
}

/**
 * Home's introduction: the `#about` row of page 622 — its heading and paragraph.
 * The Arabic is the authored one while the subsite serves that row untranslated,
 * and the row publishes no photo, so nothing is placed beside it from outside.
 */
export async function getHomeIntro(): Promise<{ title: Bi; lead: Bi }> {
  const { intro } = await readHomeProse();
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
  const { sections } = await readHomeProse();
  return sections.filter((section) => section.paragraphs.length > 0);
}

// ---------------------------------------------------------------------------
// Categories (post taxonomies) + offer categories
// ---------------------------------------------------------------------------

export async function getCategories(): Promise<CategoryTerm[]> {
  const { en, ar } = await pairLists<WPTerm>("categories");
  return en.map((t) => mapCategory(t, ar.get(t.id))).sort((a, b) => b.count - a.count);
}

export async function getOfferCategories(): Promise<CategoryTerm[]> {
  const rows = await selectList<{ id: number; name: string; slug: string; count: number }>(
    "offer-categories",
    "en",
  );
  return rows.map((t) => ({ id: t.id, slug: t.slug, name: { ar: t.name, en: t.name }, count: t.count }));
}

// ---------------------------------------------------------------------------
// Offers (WooCommerce Store API)
// ---------------------------------------------------------------------------

export async function getAllOffers(lang: Lang = "en"): Promise<Offer[]> {
  const [enRows, arRows] = await Promise.all([
    selectList<WCStoreProduct>("products", "en"),
    selectList<WCStoreProduct>("products", "ar"),
  ]);
  const other = indexById(lang === "ar" ? enRows : arRows);
  // Each language renders the products its own language's snapshot holds, in that
  // order, with nothing merged, filtered or de-duplicated.
  const primary = lang === "ar" ? arRows : enRows;
  return primary.map((p) => mapOffer(p, other.get(p.id), lang));
}

export async function getOffers(q: Query = {}, lang: Lang = "en"): Promise<Paged<Offer>> {
  let offers = await getAllOffers(lang);
  if (q.search) {
    offers = offers.filter((o) =>
      matches(q.search, haystack(o.name.ar, o.name.en, o.excerpt.ar, o.excerpt.en)),
    );
  }
  return paginate(offers, q.page, q.perPage);
}

export async function getOffer(slug: string, lang: Lang = "en"): Promise<WithSeo<OfferDetail> | null> {
  const [enRows, arRows] = await Promise.all([
    selectList<WCStoreProduct>("products", "en"),
    selectList<WCStoreProduct>("products", "ar"),
  ]);
  const decoded = safeDecode(slug);
  const primary = lang === "ar" ? arRows : enRows;
  const otherById = indexById(lang === "ar" ? enRows : arRows);
  const enById = indexById(enRows);
  const arById = indexById(arRows);
  const hit = primary.find((p) => p.slug === decoded || p.slug === slug || safeDecode(p.slug) === decoded);
  if (!hit) return null;
  const other = otherById.get(hit.id);
  const offer = mapOffer(hit, other, lang);
  const detail: OfferDetail = {
    ...offer,
    html: offerHtml(arById.get(hit.id)?.description || "", enById.get(hit.id)?.description || ""),
  };
  const seo = await buildSeo(
    enById.get(hit.id)?.permalink ?? hit.permalink,
    arById.get(hit.id)?.permalink ?? null,
    offer.name,
    offer.excerpt,
    offer.image,
  );
  return { item: detail, seo };
}

// ---------------------------------------------------------------------------
// Services (parsed from the WPBakery services page id 696)
// ---------------------------------------------------------------------------

export async function getServiceCards(): Promise<ServiceCard[]> {
  const [enP, arP] = await Promise.all([
    selectById<WPPost>("pages", "en", PAGE_IDS.services),
    selectById<WPPost>("pages", "ar", PAGE_IDS.services),
  ]);
  if (!enP) return [];
  return mapServiceCards(enP.content?.rendered || "", arP?.content?.rendered || "");
}

async function selectById<T extends { id: number }>(
  contentName: SnapshotName,
  lang: Lang,
  id: number,
): Promise<T | null> {
  const hit = (readSnapshot<T[]>(contentName, lang) || []).find((r) => r.id === id) || null;
  logSource(contentName, lang, hit ? `id ${id}` : `missing id ${id}`);
  return hit;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * SEO meta for a WordPress item: the captured `<head>` when the snapshot has it,
 * otherwise derived from real WP fields (title + excerpt + featured image).
 * The site owns canonical/hreflang (SITE_URL) in buildPageMetadata; the WP link
 * is kept only as a reference. Lists never reach here.
 */
async function buildSeo(
  enUrl: string,
  arUrl: string | null,
  title: Bi,
  excerpt: Bi,
  ogImage: string | null,
): Promise<{ en: SeoMeta; ar: SeoMeta | null }> {
  const fallbackEn: SeoMeta = {
    title: title.en,
    description: excerpt.en || title.en,
    canonical: enUrl,
    ogImage,
  };
  const en = await resolveSeo(enUrl, "en", fallbackEn);
  const ar: SeoMeta | null = arUrl
    ? await resolveSeo(arUrl, "ar", {
        title: title.ar,
        description: excerpt.ar || title.ar,
        canonical: arUrl,
        ogImage,
      })
    : null;
  return { en, ar };
}

export type { Lang };
