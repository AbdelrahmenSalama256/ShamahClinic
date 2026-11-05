import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { DoctorsClient } from "@/components/pages/DoctorsClient";
import { getBranchList, getSpecialistList } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/doctors",
    ...SITE_SEO["/doctors"],
    image: "/images/consultation.jpg",
  });
}

export default async function DoctorsPage() {
  await guardPage('doctors');
  const [branches, banner, specialists] = await Promise.all([getBranchList(), getBanner('doctors'), getSpecialistList()]);
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "الأطباء", en: "Doctors" }, path: "/doctors" },
        ])}
      />
      <DoctorsClient branches={branches} banner={banner} specialists={specialists} />
    </>
  );
}
