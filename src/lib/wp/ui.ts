import * as cheerio from "cheerio";
import type { Article as UIArticle, JournalSection } from "@/data/journal";
import type { Offer as UIOffer } from "@/data/offers";
import type { Article, ArticleCard, Offer as WpOffer, OfferDetail } from "./types";
import { toPhotoSlot, fmtDate, words, apiCardToUI } from "./ui-helpers";

/**
 * Turn a WordPress post's rendered HTML into the structured sections the article
 * layout expects (heading + paragraphs + bullet groups), walking elements in
 * document order.
 */
function sectionsFor(html: string): Array<{ heading: string; paras: string[]; bullets: string[][] }> {
  const $ = cheerio.load(`<div id="__root">${html || ""}</div>`);
  const out: Array<{ heading: string; paras: string[]; bullets: string[][] }> = [];
  let current: { heading: string; paras: string[]; bullets: string[][] } = { heading: "", paras: [], bullets: [] };
  const flush = () => {
    if (current.heading || current.paras.length || current.bullets.length) out.push(current);
  };
  $("#__root").find("h2,h3,h4,p,ul,ol").each((_, el) => {
    const $el = $(el);
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();
    if (tag === "h2" || tag === "h3" || tag === "h4") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (!text) return;
      flush();
      current = { heading: text, paras: [], bullets: [] };
    } else if (tag === "p") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text) current.paras.push(text);
    } else if (tag === "ul" || tag === "ol") {
      const items = $el
        .children("li")
        .toArray()
        .map((li) => $(li).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (items.length) current.bullets.push(items);
    }
  });
  flush();
  return out;
}

/** Zip the English + Arabic section streams by index into bilingual sections. */
function zipSections(enHtml: string, arHtml: string): JournalSection[] {
  const en = sectionsFor(enHtml);
  const ar = sectionsFor(arHtml);
  const n = Math.max(en.length, ar.length);
  const sections: JournalSection[] = [];
  for (let i = 0; i < n; i++) {
    const e = en[i];
    const a = ar[i];
    const heading = e?.heading || a?.heading || "";
    const bulletsEn = e?.bullets?.[0];
    const bulletsAr = a?.bullets?.[0];
    const section: JournalSection = {
      paragraphs: { ar: a?.paras || e?.paras || [], en: e?.paras || a?.paras || [] },
    };
    if (heading) section.heading = { ar: a?.heading || heading, en: heading };
    if (bulletsEn?.length || bulletsAr?.length) {
      section.bullets = { ar: bulletsAr || bulletsEn || [], en: bulletsEn || bulletsAr || [] };
    }
    sections.push(section);
  }
  return sections;
}

/** WP full article -> UI Article (detail page). */
export function articleToUI(article: Article): UIArticle {
  return {
    ...apiCardToUI(article),
    readMinutes: Math.max(1, Math.round(words(article.content.en) / 200)),
    sections: zipSections(article.content.en, article.content.ar),
  };
}

/** WP lightweight card -> UI Article (list / related / home). */
export function cardToUIArticle(card: ArticleCard): UIArticle {
  return apiCardToUI(card);
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

function offerIncludes(detail?: OfferDetail): { ar: string[]; en: string[] } {
  if (!detail) return { ar: [], en: [] };
  const grab = (html: string) =>
    cheerio
      .load(`<div id="__r">${html || ""}</div>`)("#__r")
      .find("li")
      .toArray()
      .map((li) => cheerio.load(li)("li").text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
  return { ar: grab(detail.html.ar), en: grab(detail.html.en) };
}

function offerBadge(discount: number | null): { ar: string; en: string } {
  return discount
    ? { ar: `خصم ${discount}٪`, en: `${discount}% off` }
    : { ar: "عرض", en: "Offer" };
}

/** WP offer (Store API) -> UI Offer (card). No invented marketing copy. */
export function offerToUI(offer: WpOffer): UIOffer {
  return {
    id: String(offer.id),
    image: offer.images.length
      ? toPhotoSlot(offer.images[0].src, offer.images[0].alt)
      : toPhotoSlot(null, offer.name),
    images: offer.images.map((img) => toPhotoSlot(img.src, img.alt)),
    // The badge is an on-sale marker, so it only exists when the data says so.
    badge: offer.onSale ? offerBadge(offer.discountPercent) : { ar: "", en: "" },
    title: offer.name,
    subtitle: offer.excerpt,
    includes: { ar: [], en: [] },
    originalPrice: offer.regularPrice,
    discountedPrice: offer.price,
    savingsPercentage: offer.discountPercent || 0,
    currency: offer.currency,
    validUntil: { ar: "", en: "" },
    href: offer.href,
    popular: Boolean(offer.onSale),
  };
}

/** WP offer detail (with parsed bullets from the description) -> UI Offer. */
export function offerDetailToUI(offer: OfferDetail): UIOffer {
  return { ...offerToUI(offer), includes: offerIncludes(offer) };
}

export { toPhotoSlot, fmtDate };
