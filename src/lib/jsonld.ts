import { SITE_URL } from "./site";
import { siteConfig } from "@/config/site";
import { clinicData } from "@/data/clinic";
import { branchesData } from "@/data/branches";
import { treatmentsData, type Treatment } from "@/data/treatments";
import { faqData, type FaqItem } from "@/data/faq";
import { type Article } from "@/data/journal";
import { images } from "./images";

type Json = Record<string, unknown>;

const logoUrl = `${SITE_URL}${images.logo}`;

/** Root Organization / MedicalBusiness schema, emitted sitewide. */
export function organizationJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalClinic",
    "@id": `${SITE_URL}/#organization`,
    name: clinicData.name.ar,
    alternateName: clinicData.name.en,
    url: SITE_URL,
    logo: logoUrl,
    image: `${SITE_URL}${images.interiors.reception.src}`,
    description:
      siteConfig.metadata.description,
    telephone: clinicData.phone,
    email: clinicData.email,
    priceRange: "EGP 850 - 6850",
    medicalSpecialty: ["Dermatology", "CosmeticMedicine", "LaserTreatment"],
    availableService: treatmentsData.map((t) => ({
      "@type": "MedicalProcedure",
      name: t.name.ar,
      alternateName: t.name.en,
      url: `${SITE_URL}/treatments/${t.id}`,
    })),
    areaServed: [
      { "@type": "City", name: "Cairo" },
      { "@type": "City", name: "Giza" },
    ],
  };
}

/** Per-branch MedicalClinic node with geo-less postal address. */
export function branchJsonLd(branch: (typeof branchesData)[number]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalClinic",
    "@id": `${SITE_URL}/branches/${branch.id}#clinic`,
    name: `${clinicData.name.ar} — ${branch.name.ar}`,
    alternateName: branch.name.en,
    url: `${SITE_URL}/branches/${branch.id}`,
    image: `${SITE_URL}${branch.image.src}`,
    telephone: branch.phone,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    address: {
      "@type": "PostalAddress",
      streetAddress: branch.address.ar,
      addressLocality: branch.area.ar,
      addressCountry: "EG",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
      opens: "10:00",
      closes: "22:00",
    },
    medicalSpecialty: ["Dermatology", "CosmeticMedicine", "LaserTreatment"],
  };
}

export function breadcrumbJsonLd(
  trail: { name: string; path: string }[]
): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}

export function faqJsonLd(items: FaqItem[] = faqData): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.question.ar,
      acceptedAnswer: { "@type": "Answer", text: f.answer.ar },
    })),
  };
}

export function articleJsonLd(article: Article): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title.ar,
    description: article.excerpt.ar,
    image: `${SITE_URL}${article.image.src}`,
    datePublished: article.isoDate,
    dateModified: article.isoDate,
    inLanguage: "ar-EG",
    author: { "@type": "Organization", name: clinicData.name.ar },
    publisher: {
      "@type": "Organization",
      name: clinicData.name.ar,
      logo: { "@type": "ImageObject", url: logoUrl },
    },
    mainEntityOfPage: `${SITE_URL}/blogs/${article.slug}`,
  };
}

export function serviceJsonLd(treatment: Treatment): Json {
  return {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: treatment.name.ar,
    alternateName: treatment.name.en,
    description: treatment.description.ar,
    image: `${SITE_URL}${treatment.image.src}`,
    url: `${SITE_URL}/treatments/${treatment.id}`,
    procedureType: "https://schema.org/CosmeticProcedure",
    provider: { "@id": `${SITE_URL}/#organization` },
    offers: {
      "@type": "Offer",
      price: treatment.priceStartingAt,
      priceCurrency: "EGP",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/treatments/${treatment.id}`,
    },
  };
}

export function webSiteJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: clinicData.name.ar,
    alternateName: clinicData.name.en,
    inLanguage: ["ar-EG", "en"],
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
