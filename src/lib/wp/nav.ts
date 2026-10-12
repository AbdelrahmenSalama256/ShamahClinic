import { PAGE_IDS } from "./config";
import { getAllPages } from "./index";
import { primaryNav, type NavItem } from "@/lib/site";
import type { Bi } from "./types";

export interface NavData {
  /**
   * Bilingual labels in display order; the client picks a side from the URL
   * prefix. Items whose href has no WordPress page keep the authored label.
   */
  items: NavItem[];
  /** The header/footer booking CTA. */
  book: Bi;
}

/**
 * href on this site → the WordPress page whose title is that item's label in the
 * live site's own menu (`menu-item-870 → page 622`, `#717 → 696`, `#755 → 9`,
 * `#643 → 62`, `#646 → 67`, `#647 → 32`, `#838 → 837`). Labels therefore follow
 * dashboard edits; routes stay ours. `/results`, `/doctors` and `/branches` have
 * no WordPress page, so their authored labels stay in place.
 */
const LABEL_PAGE: Record<string, number> = {
  "/": PAGE_IDS.home,
  "/about": PAGE_IDS.about,
  "/services": PAGE_IDS.services,
  "/offers": PAGE_IDS.shop,
  "/blogs": PAGE_IDS.journal,
  "/contact": PAGE_IDS.contact,
};

const FALLBACK_BOOK: Bi = { ar: "احجزي موعدك", en: "Book" };

export async function getNav(): Promise<NavData> {
  let titles = new Map<number, Bi>();
  try {
    titles = new Map((await getAllPages()).map((p) => [p.id, p.title]));
  } catch {
    titles = new Map();
  }
  // The header/footer CTA keeps the authored English word: page 837 is titled
  // `booking` in the dashboard (an internal form-page name) and that string does
  // not belong on a button. The Arabic title is the real label, so it is used.
  const arTitle = titles.get(PAGE_IDS.booking)?.ar;
  const book: Bi = { ar: arTitle || FALLBACK_BOOK.ar, en: FALLBACK_BOOK.en };
  const items = primaryNav.map((item) => {
    const pageId = LABEL_PAGE[item.href];
    const title = pageId ? titles.get(pageId) : undefined;
    if (!title) return item;
    return {
      ...item,
      label: { ar: title.ar || item.label.ar, en: title.en || item.label.en },
    };
  });
  return { items, book };
}
