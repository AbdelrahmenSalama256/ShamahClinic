import { DEFAULT_PER_PAGE, MAX_PER_PAGE, PAGE_IDS, TAXONOMY_REVALIDATE, WHATSAPP, isBuildPhase, logSource } from "./config";
import { wpFetch, type WpFetchOptions } from "./http";
import {
  readSnapshot,
  snapshotExists,
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
import { hrefPair, arabicRatio } from "./lang";
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
  Settings,
  WCStoreProduct,
  WPMedia,
  WPPost,
  WPTerm,
  Lang,
} from "./types";
import { siteConfig } from "@/config/site";
import type { BranchDetail } from "@/data/branches";
import type { PhotoSlot } from "@/lib/images";
import { mergeBranches, parseOffices } from "./branches";
import { heroPhotos } from "./hero";

// Lists never carry `content` and never use `_embed`; images and term names are
// hydrated from dedicated batched endpoints (see buildContext).
const LIST_FIELDS = "id,slug,date,modified,link,title,excerpt,categories,featured_media";
const DETAIL_FIELDS = `${LIST_FIELDS},content`;
const PAGE_LIST_FIELDS = "id,slug,date,modified,link,title,excerpt";
const PAGE_DETAIL_FIELDS = `${PAGE_LIST_FIELDS},content`;
const MEDIA_FIELDS = "id,source_url,alt_text,media_details";

const POSTS_LIST_REL = `/wp/v2/posts?per_page=100&_fields=${LIST_FIELDS}`;
const PAGES_LIST_REL = `/wp/v2/pages?per_page=100&_fields=${PAGE_LIST_FIELDS}`;
const CATEGORIES_REL = "/wp/v2/categories?per_page=100&_fields=id,name,slug,count";
const PRODUCTS_REL = "/wc/store/v1/products?per_page=100";
const OFFER_CATEGORIES_REL = "/wc/store/v1/products/categories";

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
function reason(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60);
}

// ---------------------------------------------------------------------------
// Snapshot-first selection
//
// Build (`NEXT_PHASE=phase-production-build`): read data/wp/*.json only — the
// live WordPress host is never contacted, so `next build` cannot stall on it.
// Runtime: live with a short abort + one retry, snapshot otherwise. The served
// source is logged once per kind.
// ---------------------------------------------------------------------------

async function selectList<T>(
  name: SnapshotName,
  lang: Lang,
  rel: string,
  opts?: WpFetchOptions,
): Promise<T[]> {
  if (isBuildPhase()) {
    logSource(name, lang, "snapshot", "build");
    return readSnapshot<T[]>(name, lang) ?? [];
  }
  try {
    const res = await wpFetch<T[]>(rel, lang, opts);
    const rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length && snapshotExists(name, lang)) throw new Error("empty live response");
    logSource(name, lang, "live", `${rows.length} rows`);
    return rows;
  } catch (err) {
    logSource(name, lang, "snapshot", reason(err));
    return readSnapshot<T[]>(name, lang) ?? [];
  }
}

async function selectBySlug<T extends { slug: string }>(
  listName: SnapshotName,
  contentName: SnapshotName,
  lang: Lang,
  slug: string,
  rel: string,
): Promise<T | null> {
  const fromSnapshot = () => {
    const rows = readSnapshot<T[]>(contentName, lang) || readSnapshot<T[]>(listName, lang) || [];
    return rows.find((r) => r.slug === slug) || null;
  };
  if (isBuildPhase()) {
    const hit = fromSnapshot();
    logSource(contentName, lang, "snapshot", hit ? `build ${slug}` : `build missing ${slug}`);
    return hit;
  }
  try {
    const res = await wpFetch<T[]>(rel, lang);
    const rows = Array.isArray(res.data) ? res.data : [];
    const hit = rows.find((r) => r.slug === slug) || (rows.length === 1 ? rows[0] : null);
    if (hit) {
      logSource(contentName, lang, "live", slug);
      return hit;
    }
    throw new Error("slug not in live response");
  } catch (err) {
    const hit = fromSnapshot();
    logSource(contentName, lang, "snapshot", hit ? `${slug} (${reason(err)})` : reason(err));
    return hit;
  }
}

/** Media + taxonomy lookups so list rows can be mapped without `_embed`. */
async function buildContext(rows: WPPost[]): Promise<MapContext> {
  const media = snapshotMedia();
  const missing = new Set<number>();
  for (const r of rows) if (r.featured_media && !media.has(r.featured_media)) missing.add(r.featured_media);
  if (missing.size && !isBuildPhase()) {
    const ids = [...missing].slice(0, 100).join(",");
    try {
      const res = await wpFetch<WPMedia[]>(
        `/wp/v2/media?include=${ids}&per_page=100&_fields=${MEDIA_FIELDS}`,
        "en",
        { revalidate: TAXONOMY_REVALIDATE },
      );
      for (const m of res.data || []) media.set(m.id, m);
      logSource("media", "en", "live", `${res.data?.length || 0} of ${missing.size}`);
    } catch (err) {
      logSource("media", "en", "snapshot", reason(err));
    }
  } else if (missing.size) {
    logSource("media", "en", "snapshot", `${missing.size} unresolved`);
  }

  const taxonomy = { revalidate: TAXONOMY_REVALIDATE };
  const [termsEn, termsAr] = await Promise.all([
    selectList<WPTerm>("categories", "en", CATEGORIES_REL, taxonomy),
    selectList<WPTerm>("categories", "ar", CATEGORIES_REL, taxonomy),
  ]);
  return { media, termsEn: indexById(termsEn), termsAr: indexById(termsAr) };
}

/** English rows are authoritative; Arabic rows (same ids) supply the other language. */
async function pairLists<T extends { id: number }>(
  name: SnapshotName,
  rel: string,
  opts?: WpFetchOptions,
): Promise<{ en: T[]; ar: Map<number, T> }> {
  const [en, ar] = await Promise.all([
    selectList<T>(name, "en", rel, opts),
    selectList<T>(name, "ar", rel, opts),
  ]);
  return { en, ar: indexById(ar) };
}

// ---------------------------------------------------------------------------
// Settings + branches (config/static per docs/inventory.md)
// ---------------------------------------------------------------------------

export async function getSettings(lang: Lang = "en"): Promise<Settings> {
  const [offers, branches] = await Promise.all([
    getOffers({ perPage: 1 }, lang),
    getBranchList(),
  ]);
  return {
    name: siteConfig.brand.name.en,
    tagline: "Great Skin Doesn't Happen By Chance",
    currency: offers.items[0]?.currency || "EGP",
    phone: siteConfig.contact.phone,
    whatsapp: WHATSAPP,
    email: siteConfig.contact.email,
    hours: siteConfig.contact.workingHours.en,
    branches: branches.length,
  };
}

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
  const { en, ar } = await pairLists<WPPost>("posts-list", POSTS_LIST_REL);
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
  const rel = `/wp/v2/posts?slug=${encodeURIComponent(decoded)}&_fields=${DETAIL_FIELDS}`;
  const [enP, arP] = await Promise.all([
    selectBySlug<WPPost>("posts-list", "posts", "en", decoded, rel),
    selectBySlug<WPPost>("posts-list", "posts", "ar", decoded, rel),
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
  const { en, ar } = await pairLists<WPPost>("pages-list", PAGES_LIST_REL);
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
  const rel = `/wp/v2/pages?slug=${encodeURIComponent(decoded)}&_fields=${PAGE_DETAIL_FIELDS}`;
  const [enP, arP] = await Promise.all([
    selectBySlug<WPPost>("pages-list", "pages", "en", decoded, rel),
    selectBySlug<WPPost>("pages-list", "pages", "ar", decoded, rel),
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
  const decoded = safeDecode(slug);
  const rel = `/wp/v2/pages?slug=${encodeURIComponent(decoded)}&_fields=${PAGE_DETAIL_FIELDS}`;
  const row = await selectBySlug<WPPost>("pages-list", "pages", lang, decoded, rel);
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

/**
 * A page's heading as the data team writes it in WordPress, used for the hero title
 * and breadcrumb of the matching route. `authored` stays in charge of Arabic where
 * the TranslatePress subsite never translated the title (page 3 is "Privacy Policy"
 * in both languages), so an Arabic page never opens with an English heading.
 */
export async function getPageTitle(
  slug: string,
  authored: Bi,
): Promise<Bi> {
  const card = (await getAllPages()).find((p) => p.slug === slug);
  if (!card) return authored;
  return {
    ar: arabicRatio(card.title.ar) > 0.3 ? card.title.ar : authored.ar,
    en: card.title.en || authored.en,
  };
}

// ---------------------------------------------------------------------------
// Categories (post taxonomies) + offer categories
// ---------------------------------------------------------------------------

export async function getCategories(): Promise<CategoryTerm[]> {
  const { en, ar } = await pairLists<WPTerm>("categories", CATEGORIES_REL, {
    revalidate: TAXONOMY_REVALIDATE,
  });
  return en.map((t) => mapCategory(t, ar.get(t.id))).sort((a, b) => b.count - a.count);
}

export async function getOfferCategories(): Promise<CategoryTerm[]> {
  const rows = await selectList<{ id: number; name: string; slug: string; count: number }>(
    "offer-categories",
    "en",
    OFFER_CATEGORIES_REL,
    { revalidate: TAXONOMY_REVALIDATE },
  );
  return rows.map((t) => ({ id: t.id, slug: t.slug, name: { ar: t.name, en: t.name }, count: t.count }));
}

// ---------------------------------------------------------------------------
// Offers (WooCommerce Store API)
// ---------------------------------------------------------------------------

export async function getAllOffers(lang: Lang = "en"): Promise<Offer[]> {
  const [enRows, arRows] = await Promise.all([
    selectList<WCStoreProduct>("products", "en", PRODUCTS_REL),
    selectList<WCStoreProduct>("products", "ar", PRODUCTS_REL),
  ]);
  const other = indexById(lang === "ar" ? enRows : arRows);
  // Each language renders the products its own REST base returns, in that
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
    selectList<WCStoreProduct>("products", "en", PRODUCTS_REL),
    selectList<WCStoreProduct>("products", "ar", PRODUCTS_REL),
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
  const rel = `/wp/v2/pages/${PAGE_IDS.services}?_fields=id,slug,link,title,excerpt,content`;
  const [enP, arP] = await Promise.all([
    selectById<WPPost>("pages", "en", PAGE_IDS.services, rel),
    selectById<WPPost>("pages", "ar", PAGE_IDS.services, rel),
  ]);
  if (!enP) return [];
  return mapServiceCards(enP.content?.rendered || "", arP?.content?.rendered || "");
}

async function selectById<T extends { id: number }>(
  contentName: SnapshotName,
  lang: Lang,
  id: number,
  rel: string,
): Promise<T | null> {
  const fromSnapshot = () => (readSnapshot<T[]>(contentName, lang) || []).find((r) => r.id === id) || null;
  if (isBuildPhase()) {
    logSource(contentName, lang, "snapshot", `build id ${id}`);
    return fromSnapshot();
  }
  try {
    const res = await wpFetch<T>(rel, lang);
    if (res.data && typeof res.data === "object") {
      logSource(contentName, lang, "live", `id ${id}`);
      return res.data;
    }
    throw new Error("empty live response");
  } catch (err) {
    logSource(contentName, lang, "snapshot", `id ${id} (${reason(err)})`);
    return fromSnapshot();
  }
}

// ---------------------------------------------------------------------------
// Home aggregate (shorter home: offers <=4, journal <=3, branches, settings)
// ---------------------------------------------------------------------------

export interface HomeData {
  settings: Settings;
  offers: Offer[];
  articles: ArticleCard[];
  branches: BranchView[];
}

export async function getHome(
  opts: { offers?: number; articles?: number; lang?: Lang } = {},
): Promise<HomeData> {
  const offersCount = opts.offers ?? 4;
  const articlesCount = opts.articles ?? 3;
  const lang = opts.lang ?? "en";
  const [settings, offersPaged, articlesPaged, branches] = await Promise.all([
    getSettings(lang),
    getOffers({ perPage: offersCount }, lang),
    getPosts({ perPage: articlesCount }),
    getBranches(),
  ]);
  return { settings, offers: offersPaged.items, articles: articlesPaged.items, branches };
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
