import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";
import { aboutFallback } from "@/data/about";
import { getPage, getBranchList } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/about",
    ...SITE_SEO["/about"],
    image: "/images/clinic-reception.jpg",
  });
}

export default async function AboutPage() {
  await guardPage('about');
  const [page, branches, treatments, banner] = await Promise.all([
    getPage('about'),
    getBranchList(),
    getMergedTreatments(),
    getBanner('about'),
  ]);
  const about = page
    ? {
        title: { ar: page.item.title.ar || aboutFallback.title.ar, en: page.item.title.en || aboutFallback.title.en },
        lead: { ar: page.item.html.ar || aboutFallback.lead.ar, en: page.item.html.en || aboutFallback.lead.en },
        sections: aboutFallback.sections,
      }
    : aboutFallback;
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "من نحن", en: "About" }, path: "/about" },
        ])}
      />
      <AboutClient
        about={about}
        branchCount={branches.length}
        treatmentCount={treatments.length}
        banner={banner}
      />
    </>
  );
}
