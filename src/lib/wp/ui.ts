import * as cheerio from "cheerio";
import type { Article as UIArticle } from "@/data/journal";
import type { Offer as UIOffer } from "@/data/offers";
import type { Article, ArticleCard, Offer as WpOffer, OfferDetail } from "./types";
import { toPhotoSlot, fmtDate, words, apiCardToUI } from "./ui-helpers";

/**
 * WP full article -> UI Article (detail page).
 *
 * The reading time counts the words the reader is about to read, in the language of the
 * route. The old number came from the English body even on `/ar`, so an Arabic article
 * that had no English at all was a "1 min read".
 */
export function articleToUI(article: Article, lang: 'ar' | 'en'): UIArticle {
  return {
    ...apiCardToUI(article),
    readMinutes: Math.max(1, Math.round(words(article.content[lang]) / 200)),
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

/**
 * The offer's end day as the sentence the card prints, in both languages.
 *
 * No day typed in the console is no sentence: an offer with no expiry used to be able to
 * carry a hardcoded "Until the end of the month", which is a claim nobody made. The day is
 * formatted at noon local so no timezone can move it — a `DATE` column read as UTC
 * midnight is the previous day for anyone west of Greenwich.
 */
function offerValidUntil(day: string | null): { ar: string; en: string } {
  if (!day) return { ar: "", en: "" };
  const iso = `${day}T12:00:00`;
  return { ar: `حتى ${fmtDate(iso, "ar-EG")}`, en: `Until ${fmtDate(iso, "en-GB")}` };
}

/** WP offer (Store API) -> UI Offer (card). No invented marketing copy. */
export function offerToUI(offer: WpOffer): UIOffer {
  return {
    id: String(offer.id),
    slug: offer.slug,
    services: offer.services,
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
    validUntil: offerValidUntil(offer.validUntil),
    href: offer.href,
    popular: Boolean(offer.onSale),
  };
}

/** WP offer detail (with parsed bullets from the description) -> UI Offer. */
export function offerDetailToUI(offer: OfferDetail): UIOffer {
  return { ...offerToUI(offer), includes: offerIncludes(offer) };
}

export { toPhotoSlot, fmtDate };
