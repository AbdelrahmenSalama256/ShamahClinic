import * as cheerio from "cheerio";
import type {
  Article,
  ArticleCard,
  Bi,
  CategoryTerm,
  Offer,
  PageContent,
  ServiceCard,
  WCStoreProduct,
  WPMedia,
  WPPost,
  WPTerm,
} from "./types";
import { decodeEntities, firstParagraph, htmlToText, sanitizeHtmlBody, bestImageSrc } from "./sanitize";
import { mirrorSrc } from "./mirror";
import { hrefPair } from "./lang";

/** WooCommerce minor-unit string price -> decimal number. */
export function minorToDecimal(value: string | number | undefined, minorUnit: number): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** (minorUnit ?? 2);
}

/** Lookups assembled once per read: media by id, terms by id per language. */
export interface MapContext {
  media: Map<number, WPMedia>;
  termsEn: Map<number, WPTerm>;
  termsAr: Map<number, WPTerm>;
}

function featuredImage(post: WPPost, ctx: MapContext): { src: string | null; alt: string } {
  const media = post.featured_media ? ctx.media.get(post.featured_media) : undefined;
  if (!media) return { src: null, alt: "" };
  return { src: bestImageSrc(media.media_details?.sizes, media.source_url), alt: media.alt_text || "" };
}

function postTerm(post: WPPost, ctx: MapContext, lang: "en" | "ar"): WPTerm | null {
  const ids = post.categories || [];
  const map = lang === "ar" ? ctx.termsAr : ctx.termsEn;
  for (const id of ids) {
    const hit = map.get(id);
    if (hit) return hit;
  }
  return null;
}

function bi(ar: string, en: string): Bi {
  return { ar: ar || en, en: en || ar };
}

/** Sanitized product bodies, exactly as WordPress returns them per language. */
export function offerHtml(arHtml: string, enHtml: string): Bi {
  return {
    ar: sanitizeHtmlBody(arHtml || ""),
    en: sanitizeHtmlBody(enHtml || ""),
  };
}

/** Merge an EN post with its AR twin (same id) into a bilingual card. */
export function mapArticleCard(en: WPPost, ar: WPPost | null | undefined, ctx: MapContext): ArticleCard {
  const img = featuredImage(en, ctx);
  const catEn = postTerm(en, ctx, "en");
  const catAr = postTerm(ar || en, ctx, "ar");
  return {
    id: en.id,
    slug: en.slug,
    title: bi(ar ? decodeEntities(ar.title.rendered) : "", decodeEntities(en.title.rendered)),
    excerpt: bi(
      ar ? htmlToText(ar.excerpt.rendered || "") : "",
      htmlToText(en.excerpt.rendered || ""),
    ),
    image: img.src,
    imageAlt: bi(img.alt, img.alt),
    date: en.date,
    modified: en.modified || en.date,
    category: catEn || catAr ? bi(catAr?.name || "", catEn?.name || catAr?.name || "") : null,
    categorySlug: catEn?.slug || catAr?.slug || null,
    href: hrefPair(`blogs/${en.slug}`),
  };
}

export function mapArticle(en: WPPost, ar: WPPost | null | undefined, ctx: MapContext): Article {
  const card = mapArticleCard(en, ar, ctx);
  return {
    ...card,
    // Detail rows carry the body, so a missing teaser is taken from the real
    // translated content instead of leaking English into the Arabic layout.
    excerpt: {
      ar: card.excerpt.ar || firstParagraph(ar?.content?.rendered || ""),
      en: card.excerpt.en || firstParagraph(en.content?.rendered || ""),
    },
    content: bi(
      ar ? sanitizeHtmlBody(ar.content.rendered || "") : "",
      sanitizeHtmlBody(en.content.rendered || ""),
    ),
  };
}

/**
 * Merge one product with its twin from the other language (same id). `primary`
 * is the row returned by the REST base of the language being rendered, so the
 * list, slug and prices are exactly what that language's store returns.
 */
export function mapOffer(primary: WCStoreProduct, other: WCStoreProduct | undefined, primaryLang: "en" | "ar"): Offer {
  const unit = primary.prices?.currency_minor_unit ?? 2;
  const price = minorToDecimal(primary.prices?.price, unit);
  const regular = minorToDecimal(primary.prices?.regular_price, unit);
  const onSale = Boolean(primary.on_sale);
  const discount = onSale && regular > price && price > 0 ? Math.round(((regular - price) / regular) * 100) : null;
  const enRow = primaryLang === "en" ? primary : other;
  const arRow = primaryLang === "ar" ? primary : other;
  const name = bi(
    arRow ? decodeEntities(arRow.name) : "",
    decodeEntities(enRow ? enRow.name : primary.name),
  );
  // WooCommerce prints an empty `alt` for most product images, and an image with
  // no text at all is unreadable to a screen reader, so the product's own name
  // stands in. Nothing is invented beyond that: the list, its order and its URLs
  // are exactly what this language's store row returned.
  const images = (primary.images || [])
    .filter((img) => typeof img?.src === "string" && img.src.trim())
    .map((img) => {
      const alt = (img.alt || "").trim();
      return {
        src: mirrorSrc(img.src.trim()),
        alt: bi(alt || name.ar || name.en, alt || name.en || name.ar),
      };
    });
  return {
    id: primary.id,
    slug: primary.slug,
    name,
    excerpt: bi(
      arRow ? htmlToText(arRow.short_description || "") : "",
      htmlToText(enRow ? enRow.short_description || "" : primary.short_description || ""),
    ),
    price,
    regularPrice: regular || price,
    currency: primary.prices?.currency_code || "EGP",
    onSale,
    discountPercent: discount,
    images,
    image: images[0]?.src ?? null,
    imageAlt: images[0]?.alt ?? bi("", ""),
    // The snapshot has no service links and no validity window: a WooCommerce product
    // never carried either. Both are the unconfigured answer, which the booking reads
    // as "no restriction" rather than as an empty list — see ../content/offer-services.ts.
    services: null,
    validFrom: null,
    validUntil: null,
    href: { en: `/offers/${primary.slug}`, ar: `/offers/${primary.slug}` },
  };
}

export function mapCategory(en: WPTerm, ar?: WPTerm): CategoryTerm {
  return {
    id: en.id,
    slug: en.slug,
    name: bi(ar?.name || "", en.name),
    count: en.count,
  };
}

export function mapPage(
  en: { id: number; slug: string; title: { rendered: string }; content: { rendered?: string } },
  ar?: { title: { rendered: string }; content: { rendered?: string } } | null,
): PageContent {
  return {
    id: en.id,
    slug: en.slug,
    title: bi(ar ? decodeEntities(ar.title.rendered) : "", decodeEntities(en.title.rendered)),
    html: bi(
      ar ? sanitizeHtmlBody(ar.content.rendered || "") : "",
      sanitizeHtmlBody(en.content.rendered || ""),
    ),
    href: hrefPair(en.slug),
  };
}

/**
 * Extract ordered service sections (title + intro + image) from a WPBakery services page.
 * Walks headings in document order and grabs the nearest image + paragraph in the same column.
 */
export function extractServiceSections(html: string): Array<{ title: string; intro: string; image: string | null }> {
  const $ = cheerio.load(html || "<div></div>");
  const byTitle = new Map<string, { title: string; intro: string; image: string | null }>();
  for (const node of $("h2, h3").toArray()) {
    const title = decodeEntities($(node).text()).replace(/^\s*\d+\.\s*/, "").trim();
    if (!title || title.length < 3) continue;
    // WPBakery wraps each service in a column; a bare `div` match would stop at
    // the caption overlay and lose both the image and the paragraph.
    const column = $(node).closest(".vc_column-inner, .wpb_column, .vc_column_container");
    const image = mirrorSrc(column.find("img").first().attr("src") || null);
    const intro = column
      .find("p")
      .toArray()
      .map((p) => $(p).text())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const key = title.toLowerCase();
    const existing = byTitle.get(key);
    const candidate = { title, intro: decodeEntities(intro), image: image ? rewriteAbs(image) : null };
    if (!existing || score(candidate) > score(existing)) byTitle.set(key, candidate);
  }
  const sections = [...byTitle.values()];
  // Service blocks always carry their own image; text-only headings are page chrome.
  const withImage = sections.filter((s) => s.image);
  return withImage.length ? withImage : sections;
}

function score(s: { intro: string; image: string | null }): number {
  return (s.image ? 2 : 0) + (s.intro.length > 20 ? 1 : 0);
}
function rewriteAbs(src: string): string {
  return src.replace(/^https?:\/\/www\.shamahclinics\.com/, "");
}

/** Zip EN + AR service sections (same order) into bilingual cards. */
export function mapServiceCards(enHtml: string, arHtml: string): ServiceCard[] {
  const en = extractServiceSections(enHtml);
  const ar = extractServiceSections(arHtml);
  return en
    .filter((s) => !/^(home|الرئيسية)$/i.test(s.title))
    .map((s, i) => {
      const partner = ar[i];
      const slug = slugify(s.title) || `service-${i + 1}`;
      return {
        id: i + 1,
        slug,
        title: bi(partner?.title || "", s.title),
        intro: bi(partner?.intro || "", s.intro),
        image: s.image || partner?.image || null,
        // A WordPress service section is a section of page 696, not a route of its
        // own; `/services/<wp-slug>` would 404 for every title we do not author.
        href: hrefPair("services"),
      };
    });
}

function slugify(text: string): string {
  // Arabic titles have no latin slug; keep latin ones, else empty (caller falls back to index).
  const latin = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return latin.length > 2 ? latin : "";
}
