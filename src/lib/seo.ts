import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { SITE_URL } from "./site";
import { getLocalizedHref, type Locale } from "./locale";

interface LocalizedText {
  ar: string;
  en: string;
}

interface PageMetaInput {
  /** Path without trailing slash, e.g. /services. Use "" for home. */
  path: string;
  title: LocalizedText;
  description: LocalizedText;
  image?: string;
  type?: "website" | "article";
}

/**
 * Builds per-page metadata: unique Arabic title/description, canonical,
 * hreflang ar/en alternates, Open Graph and Twitter cards.
 */
export function buildPageMetadata({ path, title, description, image, type = "website" }: PageMetaInput): Metadata {
  const url = `${SITE_URL}${getLocalizedHref(path)}`;
  const ogImage = image ? `${SITE_URL}${image}` : `${SITE_URL}/images/clinic-reception.jpg`;
  const localizedUrl = (language: Locale) =>
    `${SITE_URL}${getLocalizedHref(path, language)}`;

  return {
    title: { absolute: `${title.ar} | ${siteConfig.brand.name.ar}` },
    description: description.ar,
    alternates: {
      canonical: url,
      languages: {
        ar: localizedUrl("ar"),
        en: localizedUrl("en"),
        "x-default": url,
      },
    },
    openGraph: {
      title: title.ar,
      description: description.ar,
      url,
      siteName: siteConfig.brand.name.en,
      locale: siteConfig.metadata.locale,
      alternateLocale: [siteConfig.metadata.alternateLocale],
      type,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title.ar }],
    },
    twitter: {
      card: "summary_large_image",
      title: title.ar,
      description: description.ar,
      images: [ogImage],
    },
  };
}
