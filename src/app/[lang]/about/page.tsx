import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";
import { aboutFallback } from "@/data/about";
import { getBranchList } from "@/lib/content/site";
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
  const [about, branches, treatments, banner] = await Promise.all([
    Promise.resolve(aboutFallback),
    getBranchList(),
    getMergedTreatments(),
    getBanner('about'),
  ]);
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
