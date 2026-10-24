import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { siteConfig } from "@/config/site";
import { getLocalizedHref, type Locale } from "@/lib/locale";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { getAllArticles, getAllOffers, getAllPages } from "@/lib/content/site";
import { getBranchList } from "@/lib/content/site";
import { readPageStates, type PageStates } from "@/lib/content/page-visibility";
import type { SitePageKey } from "@/lib/content/settings-catalog";

const LANGS: Locale[] = ["ar", "en"];

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

interface Route {
  path: string;
  priority: number;
  changeFrequency: ChangeFreq;
  /** Only ever the WordPress `modified` timestamp; never a made-up date. */
  lastModified?: Date;
  /** The Settings toggle that owns this URL and everything under it. */
  page: SitePageKey;
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
  const [articles, offersAr, offersEn, pages, branches, treatments, states] = await Promise.all([
    getAllArticles(),
    getAllOffers("ar"),
    getAllOffers("en"),
    getAllPages().catch(() => []),
    getBranchList(),
    getMergedTreatments(),
    readPageStates(),
  ]);

  // A hidden page is not a canonical URL: it either 404s or redirects, and a sitemap
  // that lists it invites a crawler to an answer the site has already replaced.
  const shown = (state: PageStates, key: SitePageKey): boolean => state[key].enabled;

  // WordPress owns these pages, so their lastmod comes from the dashboard.
  const wpModified = (slug: string) => date(pages.find((p) => p.slug === slug)?.modified);

  const staticRoutes: Route[] = [
    { path: "", priority: 1, changeFrequency: "weekly", lastModified: wpModified("home"), page: "home" },
    { path: "/services", priority: 0.9, changeFrequency: "weekly", lastModified: wpModified("our-services"), page: "services" },
    { path: "/doctors", priority: 0.8, changeFrequency: "monthly", page: "doctors" },
    { path: "/results", priority: 0.7, changeFrequency: "monthly", page: "results" },
    { path: "/offers", priority: 0.8, changeFrequency: "weekly", lastModified: wpModified("shop"), page: "offers" },
    { path: "/branches", priority: 0.8, changeFrequency: "monthly", page: "branches" },
    { path: "/blogs", priority: 0.7, changeFrequency: "weekly", lastModified: wpModified("journal"), page: "blogs" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly", lastModified: wpModified("about"), page: "about" },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly", lastModified: wpModified("faq"), page: "faq" },
    { path: "/contact", priority: 0.9, changeFrequency: "monthly", lastModified: wpModified("contact"), page: "contact" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly", lastModified: wpModified("privacy-policy"), page: "privacy" },
  ];

  const treatmentRoutes: Route[] = treatments.map((t) => ({
    path: `/services/${t.id}`,
    priority: 0.8,
    changeFrequency: "monthly",
    page: "services",
  }));

  const branchRoutes: Route[] = branches.map((b) => ({
    path: `/branches/${b.id}`,
    priority: 0.7,
    changeFrequency: "monthly",
    page: "branches",
  }));

  const blogRoutes: Route[] = articles.map((a) => ({
    path: `/blogs/${a.slug}`,
    priority: 0.6,
    changeFrequency: "monthly",
    lastModified: date(a.modified),
    page: "blogs",
  }));

  // Every product any language's store returns, so a translation-only product
  // still appears in the sitemap.
  const offerPaths = new Set([...offersAr, ...offersEn].map((o) => o.slug));
  const offerRoutes: Route[] = [...offerPaths].map((slug) => ({
    path: `/offers/${slug}`,
    priority: 0.7,
    changeFrequency: "weekly",
    page: "offers",
  }));

  return [...staticRoutes, ...treatmentRoutes, ...branchRoutes, ...blogRoutes, ...offerRoutes]
    .filter((route) => shown(states, route.page))
    .flatMap(entriesFor);
}
