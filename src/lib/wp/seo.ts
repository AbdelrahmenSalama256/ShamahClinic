import { snapshotSeo } from "./snapshot";
import type { Lang, SeoMeta } from "./types";

/**
 * SEO meta for one detail URL: the `<head>` the snapshot captured for it,
 * otherwise derived from the row's own title, excerpt and featured image.
 *
 * BK-7.3 removed the live parse of the WordPress page — a detail render used to
 * fetch the client's HTML and screen-scrape its tags. The capture holds four
 * landing URLs, so in practice every article, offer and page is served from the
 * fallback, which is what BK-9 replaces with SEO the console actually edits.
 */
export async function resolveSeo(url: string, lang: Lang, fallback: SeoMeta): Promise<SeoMeta> {
  const captured = snapshotSeo(url, lang);
  if (!captured?.head) return fallback;
  return {
    title: captured.head.title || fallback.title,
    description: captured.head.description || fallback.description,
    canonical: fallback.canonical,
    ogImage: captured.head.ogImage || fallback.ogImage || null,
  };
}
