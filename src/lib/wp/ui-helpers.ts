import type { PhotoSlot } from "@/lib/images";
import type { Article } from "@/data/journal";
import type { ArticleCard, Bi } from "./types";

/** Build a next/image PhotoSlot from a (possibly remote) media URL. */
export function toPhotoSlot(src: string | null, alt: Bi): PhotoSlot {
  return {
    src: src || "",
    alt: { ar: alt.ar || alt.en, en: alt.en || alt.ar },
    width: 1200,
    height: 800,
    focal: "50% 50%",
  };
}

export function fmtDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(d);
  } catch {
    return iso;
  }
}

export function words(html: string): number {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

/**
 * Map an API article card (bilingual) to the UI card shape. Client-safe:
 * no cheerio / server deps, so "Load more" can transform live JSON in-browser.
 */
export function apiCardToUI(card: ArticleCard): Article {
  return {
    slug: card.slug,
    title: card.title,
    excerpt: card.excerpt,
    authorId: "",
    date: { ar: fmtDate(card.date, "ar-EG"), en: fmtDate(card.date, "en-GB") },
    isoDate: card.date.slice(0, 10),
    modifiedIso: (card.modified || card.date).slice(0, 10),
    image: toPhotoSlot(card.image, card.imageAlt),
    tags: {
      ar: card.category ? [card.category.ar] : [],
      en: card.category ? [card.category.en] : [],
    },
  };
}
