import type { Metadata } from "next";
import { SITE_URL } from "./site";
import { getLocalizedHref, type Locale } from "./locale";
import { routeLang } from "./route-lang";
import { readSeoOverride } from "./content/seo";
import { getBrandWords } from "./content/site";

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
  /**
   * The address the row's author named as the canonical one, in the row's own SEO box.
   * Anything the shape cannot answer — an empty box, a bare word — is ignored and the
   * page keeps its own URL, which is the answer a specialist would expect from a field
   * they left alone.
   */
  canonical?: string | null;
  /** The row asked not to be indexed. Nothing else about the page changes. */
  noindex?: boolean;
}

/**
 * The canonical a page publishes, given what its author typed.
 *
 * Two spellings mean the same thing to a search engine and are written differently in the
 * console's box: an owner who means *this page, over there* pastes a whole address, and one
 * who means *this page, at another path on this site* types a path. A bare word is a typo,
 * and a typo in the canonical is a page that stops being found, so the caller's own URL
 * stands instead of guessing which of the two the typo meant.
 */
export function authoritativeCanonical(value: string | null | undefined, fallback: string): string {
  const text = (value ?? '').trim();
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('//') || text.startsWith('://')) return fallback;
  return text.startsWith('/') ? `${SITE_URL}${text}` : fallback;
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
  canonical,
  noindex,
}: PageMetaInput): Promise<Metadata> {
  const lang = langOverride ?? (await routeLang());
  const other: Locale = lang === "ar" ? "en" : "ar";
  // The SEO center writes one record per address and language; that record wins over
  // the authored pair the caller passed. An empty or unreadable row is not a failure —
  // the caller's copy is already the complete answer.
  const override = await readSeoOverride(path, lang);
  const heading = override?.title || title[lang] || title[other];
  const summary = override?.description || description[lang] || description[other];
  const brand = (await getBrandWords())[lang];

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
    // Only a row that asked to stay out of the index gets a robots tag. Emitting the
    // permissive answer on every page would rewrite the served HTML of a site nobody
    // asked to change, and `index, follow` is what a crawler already assumes.
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: authoritativeCanonical(canonical, url),
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
