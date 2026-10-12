import * as cheerio from "cheerio";
import { isBuildPhase, logSource, WP_FETCH_TIMEOUT_MS } from "./config";
import { snapshotSeo } from "./snapshot";
import type { Lang, SeoMeta } from "./types";

/** SEO `<head>` is re-crawled at most daily — it changes far slower than content. */
const SEO_REVALIDATE = 86_400;

/** Parse SEO-relevant tags out of a WordPress page's HTML <head>. */
export function parseSeo(html: string, fallback: SeoMeta): SeoMeta {
  const $ = cheerio.load(html);
  const clean = (v: string | undefined) => (v || "").trim();
  const title = clean($("title").first().text());
  const description =
    clean($('meta[name="description"]').attr("content")) ||
    clean($('meta[property="og:description"]').attr("content"));
  const canonical = clean($('link[rel="canonical"]').attr("href"));
  const ogImage =
    clean($('meta[property="og:image"]').attr("content")) ||
    clean($('meta[name="twitter:image"]').attr("content"));
  return {
    title: title || fallback.title,
    description: description || fallback.description,
    canonical: canonical || fallback.canonical,
    ogImage: ogImage || fallback.ogImage || null,
  };
}

/**
 * SEO meta for one detail URL. Order: snapshot-captured `<head>` -> live HTML
 * parse (only at runtime, aborted after WP_FETCH_TIMEOUT_MS, cached a day) ->
 * title/excerpt fallback. Callers must use this for detail pages only — never
 * while mapping a list, and never during `next build`.
 */
export async function resolveSeo(url: string, lang: Lang, fallback: SeoMeta): Promise<SeoMeta> {
  const captured = snapshotSeo(url, lang);
  if (captured?.head) {
    return {
      title: captured.head.title || fallback.title,
      description: captured.head.description || fallback.description,
      canonical: fallback.canonical,
      ogImage: captured.head.ogImage || fallback.ogImage || null,
    };
  }
  if (isBuildPhase() || !/^https?:\/\//.test(url)) return fallback;

  try {
    const res = await fetch(url, {
      next: { revalidate: SEO_REVALIDATE, tags: ["wp:seo"] },
      headers: { "User-Agent": "shamah-site/1.0", Accept: "text/html" },
      cache: "force-cache",
      signal: AbortSignal.timeout(WP_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    logSource("seo:head", lang, "live", url);
    return parseSeo(await res.text(), fallback);
  } catch (err) {
    logSource("seo:head", lang, "snapshot", err instanceof Error ? err.message : "failed");
    return fallback;
  }
}
