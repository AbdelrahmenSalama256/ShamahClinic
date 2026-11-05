import type { Lang } from "./types";

const ARABIC_RANGE = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufeff]/g;

/** Ratio of Arabic-script characters to non-space characters (0..1). */
export function arabicRatio(text: string): number {
  const compact = (text || "").replace(/\s+/g, "");
  if (!compact) return 0;
  const arabic = (compact.match(ARABIC_RANGE) || []).length;
  return arabic / compact.length;
}

/**
 * Classify a single item's language. Primary signal: the permalink carries the `/ar/`
 * subsite prefix. Fallback: Arabic-script ratio of the title (>0.3 => Arabic).
 *
 * In this project the authoritative split is the REST base URL (see DECISIONS.md);
 * this classifier is used to VALIDATE that a fetched list matches its requested language
 * and to bucket any mixed source.
 */
export function classifyLang(item: { link?: string; title?: string; name?: string }): Lang {
  const link = item.link || "";
  if (/^https?:\/\/[^/]+\/ar(\/|$)/.test(link) || link.startsWith("/ar/")) return "ar";
  const label = item.title || item.name || "";
  return arabicRatio(label) > 0.3 ? "ar" : "en";
}

/** Build the paired href for both languages from a shared slug. */
export function hrefPair(slug: string): { ar: string; en: string } {
  const clean = slug.replace(/^\/+|\/+$/g, "");
  return { en: `/${clean}`, ar: `/ar/${clean}` };
}

/** Count how many items classify as each language (for validation + DECISIONS). */
export function languageCounts<T extends { link?: string; title?: string; name?: string }>(
  items: T[],
): { ar: number; en: number } {
  let ar = 0;
  let en = 0;
  for (const it of items) {
    if (classifyLang(it) === "ar") ar += 1;
    else en += 1;
  }
  return { ar, en };
}
