import { SITE_URL } from "./site";
import { siteConfig } from "@/config/site";
import { getClinicWords, getBrandWords, type BrandWords } from "./content/site";
import type { BranchDetail } from "@/data/branches";
import type { Treatment } from "@/data/treatments";
import { faqData, type FaqItem } from "@/data/faq";
import { type Article } from "@/data/journal";
import { getBranchList } from "./wp";
import { getMergedTreatments } from "./wp/treatments";
import { images } from "./images";
import { getLocalizedHref, type Locale } from "./locale";
import { routeLang } from "./route-lang";

type Json = Record<string, unknown>;

const logoUrl = `${SITE_URL}${images.logo}`;
const OG_LOCALE: Record<Locale, string> = { ar: "ar_EG", en: "en_US" };

/** Resolve an image URL that may already be absolute (e.g. WordPress media). */
function absUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `${SITE_URL}${u}`;
}

function localized(path: string, lang: Locale): string {
  return `${SITE_URL}${getLocalizedHref(path, lang)}`;
}

/** The name of an entity in the rendered language, other language as alias. */
function names(label: { ar: string; en: string }, lang: Locale) {
  return { name: label[lang], alternateName: label[lang === "ar" ? "en" : "ar"] };
}

/**
 * Root MedicalBusiness / LocalBusiness node, emitted sitewide. It carries all
 * three branches so a single graph entry describes the whole clinic group.
 */
export async function organizationJsonLd(): Promise<Json> {
  const lang = await routeLang();
  const brandName = await getBrandWords();
  const brand = names(brandName, lang);
  const clinic = await getClinicWords();
  return {
    "@context": "https://schema.org",
    "@type": ["MedicalClinic", "LocalBusiness"],
    "@id": `${SITE_URL}/#organization`,
    ...brand,
    url: SITE_URL,
    logo: logoUrl,
    image: `${SITE_URL}${images.interiors.reception.src}`,
    description: lang === "ar" ? siteConfig.metadata.description : siteConfig.metadata.descriptionEn,
    telephone: clinic.phone,
    medicalSpecialty: ["Dermatology", "CosmeticMedicine", "LaserTreatment"],
    areaServed: [
      { "@type": "City", name: lang === "ar" ? "القاهرة" : "Cairo" },
      { "@type": "City", name: lang === "ar" ? "الجيزة" : "Giza" },
    ],
    branch: (await getBranchList()).map((b) => branchNode(b, lang, brandName)),
    availableService: (await getMergedTreatments()).map((t) => ({
      "@type": "MedicalProcedure",
      ...names(t.name, lang),
      url: localized(`/services/${t.id}`, lang),
    })),
  };
}

function branchNode(branch: BranchDetail, lang: Locale, brand: BrandWords): Json {
  return {
    "@type": ["MedicalClinic", "LocalBusiness"],
    "@id": `${localized(`/branches/${branch.id}`, lang)}#clinic`,
    name: `${brand[lang]} — ${branch.name[lang]}`,
    alternateName: branch.name[lang === "ar" ? "en" : "ar"],
    url: localized(`/branches/${branch.id}`, lang),
    image: `${SITE_URL}${branch.image.src}`,
    telephone: branch.phone,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    address: {
      "@type": "PostalAddress",
      streetAddress: branch.address[lang],
      addressLocality: branch.area[lang],
      addressCountry: "EG",
    },
    medicalSpecialty: ["Dermatology", "CosmeticMedicine", "LaserTreatment"],
  };
}

/** Per-branch node used on a branch detail page. */
export async function branchJsonLd(branch: BranchDetail): Promise<Json> {
  const lang = await routeLang();
  return {
    ...branchNode(branch, lang, await getBrandWords()),
    "@context": "https://schema.org",
    description: branch.intro[lang],
  };
}

export async function breadcrumbJsonLd(
  trail: { name: { ar: string; en: string } | string; path: string }[],
): Promise<Json> {
  const lang = await routeLang();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: typeof c.name === "string" ? c.name : c.name[lang],
      item: localized(c.path, lang),
    })),
  };
}

export async function faqJsonLd(items: FaqItem[] = faqData): Promise<Json> {
  const lang = await routeLang();
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question[lang],
      acceptedAnswer: { "@type": "Answer", text: f.answer[lang] },
    })),
  };
}

export async function articleJsonLd(article: Article): Promise<Json> {
  const lang = await routeLang();
  const brand = await getBrandWords();
  const path = `/blogs/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title[lang],
    description: article.excerpt[lang],
    image: absUrl(article.image.src),
    datePublished: article.isoDate,
    dateModified: article.modifiedIso || article.isoDate,
    inLanguage: OG_LOCALE[lang],
    author: { "@type": "Organization", name: brand[lang] },
    publisher: {
      "@type": "Organization",
      name: brand[lang],
      logo: { "@type": "ImageObject", url: logoUrl },
    },
    mainEntityOfPage: localized(path, lang),
  };
}

export async function serviceJsonLd(treatment: Treatment): Promise<Json> {
  const lang = await routeLang();
  const path = `/services/${treatment.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    ...names(treatment.name, lang),
    description: treatment.description[lang],
    image: `${SITE_URL}${treatment.image.src}`,
    url: localized(path, lang),
    procedureType: "https://schema.org/CosmeticProcedure",
    inLanguage: OG_LOCALE[lang],
    provider: { "@id": `${SITE_URL}/#organization` },
    // No offer node: the live site prices every service after consultation, and an
    // authored "from X EGP" would be a number WordPress never gave us. WooCommerce
    // campaign prices keep their own offerJsonLd.
  };
}

export async function webSiteJsonLd(): Promise<Json> {
  const lang = await routeLang();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    ...names(await getBrandWords(), lang),
    inLanguage: ["ar-EG", "en-US"],
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** WooCommerce offer -> schema.org Offer (price converted from minor units). */
export async function offerJsonLd(o: {
  slug: string;
  name: { ar: string; en: string };
  price: number;
  currency: string;
  image: string | null;
  description?: string;
}): Promise<Json> {
  const lang = await routeLang();
  const path = `/offers/${o.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    ...names(o.name, lang),
    description: o.description || o.name[lang],
    price: o.price,
    priceCurrency: o.currency,
    availability: "https://schema.org/InStock",
    image: o.image ? absUrl(o.image) : undefined,
    url: localized(path, lang),
    inLanguage: OG_LOCALE[lang],
    seller: { "@id": `${SITE_URL}/#organization` },
  };
}
