import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { siteConfig } from "@/config/site";
import { getLocalizedHref, type Locale } from "@/lib/locale";
import { treatmentsData } from "@/data/treatments";
import { getAllArticles, getAllOffers, getAllPages, getBranchList } from "@/lib/wp";

const LANGS: Locale[] = ["ar", "en"];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

interface Route {
  path: string;
  priority: number;
  changeFrequency: ChangeFreq;
  /** Only ever the WordPress `modified` timestamp; never a made-up date. */
  lastModified?: Date;
}

/** One URL per language, each carrying ar/en/x-default hreflang alternates. */
function entriesFor(route: Route): MetadataRoute.Sitemap {
  const { path, priority, changeFrequency, lastModified } = route;
  const languages: Record<string, string> = {
    ar: `${SITE_URL}${getLocalizedHref(path, "ar")}`,
    en: `${SITE_URL}${getLocalizedHref(path, "en")}`,
    "x-default": `${SITE_URL}${getLocalizedHref(path, "ar")}`,
  };

  return LANGS.map((lang) => ({
    url: `${SITE_URL}${getLocalizedHref(path, lang)}`,
    ...(lastModified ? { lastModified } : {}),
    priority: lang === siteConfig.defaultLanguage ? priority : priority * 0.9,
    changeFrequency,
    alternates: { languages },
  }));
}

const date = (value: string | undefined): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, offersAr, offersEn, pages, branches] = await Promise.all([
    getAllArticles(),
    getAllOffers("ar"),
    getAllOffers("en"),
    getAllPages().catch(() => []),
    getBranchList(),
  ]);

  // WordPress owns these pages, so their lastmod comes from the dashboard.
  const wpModified = (slug: string) => date(pages.find((p) => p.slug === slug)?.modified);

  const staticRoutes: Route[] = [
    { path: "", priority: 1, changeFrequency: "weekly", lastModified: wpModified("home") },
    { path: "/services", priority: 0.9, changeFrequency: "weekly", lastModified: wpModified("our-services") },
    { path: "/doctors", priority: 0.8, changeFrequency: "monthly" },
    { path: "/results", priority: 0.7, changeFrequency: "monthly" },
    { path: "/offers", priority: 0.8, changeFrequency: "weekly", lastModified: wpModified("shop") },
    { path: "/branches", priority: 0.8, changeFrequency: "monthly" },
    { path: "/blogs", priority: 0.7, changeFrequency: "weekly", lastModified: wpModified("journal") },
    { path: "/about", priority: 0.6, changeFrequency: "monthly", lastModified: wpModified("about") },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly", lastModified: wpModified("faq") },
    { path: "/contact", priority: 0.9, changeFrequency: "monthly", lastModified: wpModified("contact") },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: wpModified("privacy-policy") },
  ];

  const treatmentRoutes: Route[] = treatmentsData.map((t) => ({
    path: `/treatments/${t.id}`,
    priority: 0.8,
    changeFrequency: "monthly",
  }));

  const branchRoutes: Route[] = branches.map((b) => ({
    path: `/branches/${b.id}`,
    priority: 0.7,
    changeFrequency: "monthly",
  }));

  const blogRoutes: Route[] = articles.map((a) => ({
    path: `/blogs/${a.slug}`,
    priority: 0.6,
    changeFrequency: "monthly",
    lastModified: date(a.modified),
  }));

  // Every product any language's store returns, so a translation-only product
  // still appears in the sitemap.
  const offerPaths = new Set([...offersAr, ...offersEn].map((o) => o.slug));
  const offerRoutes: Route[] = [...offerPaths].map((slug) => ({
    path: `/offers/${slug}`,
    priority: 0.7,
    changeFrequency: "weekly",
  }));

  return [...staticRoutes, ...treatmentRoutes, ...branchRoutes, ...blogRoutes, ...offerRoutes].flatMap(entriesFor);
}
