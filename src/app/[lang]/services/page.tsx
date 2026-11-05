import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { TreatmentsClient } from "@/components/pages/TreatmentsClient";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { getPageTitle } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/services",
    ...SITE_SEO["/services"],
    image: "/images/treatment-laser.jpg",
  });
}

export default async function ServicesPage() {
  await guardPage('services');
  const [treatments, title, banner] = await Promise.all([
    getMergedTreatments(),
    getPageTitle("our-services", {
      ar: "خدمات عيادات شامه التجميلية",
      en: "Shamah Clinics aesthetic treatments",
    }),
    getBanner('services'),
  ]);
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "الخدمات", en: "Services" }, path: "/services" },
        ])}
      />
      <TreatmentsClient treatments={treatments} title={title} banner={banner} />
    </>
  );
}
