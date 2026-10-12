import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { SITE_URL } from "./site";
import { getLocalizedHref, type Locale } from "./locale";
import { routeLang } from "./route-lang";

interface LocalizedText {
  ar: string;
  en: string;
}

interface PageMetaInput {
  /** Path without trailing slash or language prefix, e.g. /services. Use "" for home. */
  path: string;
  title: LocalizedText;
  description: LocalizedText;
  image?: string | null;
  type?: "website" | "article";
  /** Override the language taken from the URL segment. */
  lang?: Locale;
}

const OG_LOCALE: Record<Locale, string> = { ar: "ar_EG", en: "en_US" };

/**
 * Builds per-page metadata for the language in the URL: localized title and
 * description, a canonical on that language's own URL, hreflang ar/en
 * alternates, and Open Graph / Twitter cards.
 */
export async function buildPageMetadata({
  path,
  title,
  description,
  image,
  type = "website",
  lang: langOverride,
}: PageMetaInput): Promise<Metadata> {
  const lang = langOverride ?? (await routeLang());
  const other: Locale = lang === "ar" ? "en" : "ar";
  const heading = title[lang] || title[other];
  const summary = description[lang] || description[other];
  const brand = siteConfig.brand.name[lang];

  const url = `${SITE_URL}${getLocalizedHref(path, lang)}`;
  // WordPress SEO titles often already carry the brand, so appending it again
  // would produce "Home — Shamah Clinics | Shamah Clinics".
  const pageTitle = heading.toLowerCase().includes(brand.toLowerCase()) ? heading : `${heading} | ${brand}`;
  const isAbsolute = !!image && /^https?:\/\//i.test(image);
  const ogImage = image
    ? isAbsolute
      ? image
      : `${SITE_URL}${image}`
    : `${SITE_URL}/images/clinic-reception.jpg`;

  return {
    title: { absolute: pageTitle },
    description: summary,
    alternates: {
      canonical: url,
      languages: {
        ar: `${SITE_URL}${getLocalizedHref(path, "ar")}`,
        en: `${SITE_URL}${getLocalizedHref(path, "en")}`,
        "x-default": `${SITE_URL}${getLocalizedHref(path, "ar")}`,
      },
    },
    openGraph: {
      title: heading,
      description: summary,
      url,
      siteName: brand,
      locale: OG_LOCALE[lang],
      alternateLocale: [OG_LOCALE[other]],
      type,
      images: [{ url: ogImage, width: 1200, height: 630, alt: heading }],
    },
    twitter: {
      card: "summary_large_image",
      title: heading,
      description: summary,
      images: [ogImage],
    },
  };
}
