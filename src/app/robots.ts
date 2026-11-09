import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getSeoConfig } from "@/lib/content/seo-config";
import { robotsExtraRules } from "@/lib/content/seo-config-shape";

/**
 * robots.txt, from the SEO settings. Indexing switched off closes the whole site; otherwise
 * the owner's extra Allow/Disallow lines join the two paths that are never for a crawler.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const config = await getSeoConfig();
  if (!config.indexing) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const extra = robotsExtraRules(config.robotsExtra);
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", ...extra.allow],
        // The normalized JSON endpoints mirror page content; keep them out of the index.
        disallow: ["/api/", "/console", ...extra.disallow],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
