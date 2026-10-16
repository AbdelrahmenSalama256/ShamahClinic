import { revalidatePath } from "next/cache";
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from "payload";

/**
 * Route patterns, not concrete URLs: `type: "page"` invalidates every path that
 * matches, so a single call covers the Arabic and the English render of a route.
 * This mirrors the proven list in `app/api/revalidate/route.ts` and keeps the
 * dashboard's publish action from needing an HTTP round-trip to itself.
 */
const PATTERNS: Record<string, string[]> = {
  posts: ["/[lang]/blogs", "/[lang]/blogs/[slug]", "/[lang]"],
  categories: ["/[lang]/blogs"],
  offers: ["/[lang]/offers", "/[lang]/offers/[slug]", "/[lang]"],
  "offer-categories": ["/[lang]/offers"],
  services: ["/[lang]/services", "/[lang]/services/[slug]", "/[lang]/treatments", "/[lang]/treatments/[slug]", "/[lang]"],
  specialists: ["/[lang]/doctors"],
  results: ["/[lang]/results"],
  faqs: ["/[lang]/faq"],
  branches: ["/[lang]/branches", "/[lang]/branches/[slug]", "/[lang]"],
  pages: ["/[lang]/about", "/[lang]/privacy"],
  media: ["/[lang]"],
};

/** Every route the public site renders — used by globals and as the fallback. */
const ALL = [
  "/[lang]",
  "/[lang]/blogs",
  "/[lang]/blogs/[slug]",
  "/[lang]/offers",
  "/[lang]/offers/[slug]",
  "/[lang]/services",
  "/[lang]/services/[slug]",
  "/[lang]/treatments",
  "/[lang]/treatments/[slug]",
  "/[lang]/branches",
  "/[lang]/branches/[slug]",
  "/[lang]/about",
  "/[lang]/contact",
  "/[lang]/faq",
  "/[lang]/privacy",
  "/[lang]/doctors",
  "/[lang]/results",
];

function revalidate(patterns: string[]): void {
  for (const path of patterns) {
    try {
      revalidatePath(path, "page");
    } catch {
      /* route may not be statically rendered yet */
    }
  }
}

/**
 * Payload hooks run per-locale when a localized document is saved, but the
 * pattern-based `revalidatePath` covers both `ar` and `en` in one call, so the
 * hook is locale-agnostic by design.
 */
export function revalidateAfterChange(slug?: string): CollectionAfterChangeHook {
  return ({ doc }) => {
    revalidate(slug && PATTERNS[slug] ? PATTERNS[slug] : ALL);
    return doc;
  };
}

export function revalidateAfterDelete(slug?: string): CollectionAfterDeleteHook {
  return ({ doc }) => {
    revalidate(slug && PATTERNS[slug] ? PATTERNS[slug] : ALL);
    return doc;
  };
}

/** Global variant — site-wide chrome and home copy affect every route. */
export const revalidateGlobal: GlobalAfterChangeHook = ({ doc }) => {
  revalidate(ALL);
  return doc;
};
