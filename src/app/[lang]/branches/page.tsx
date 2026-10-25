import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { BranchesClient } from "@/components/pages/BranchesClient";
import { getBranchList } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/branches",
    ...SITE_SEO["/branches"],
    image: "/images/branch-interior.jpg",
  });
}

export default async function BranchesPage() {
  await guardPage('branches');
  const [branches, banner] = await Promise.all([getBranchList(), getBanner('branches')]);
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "الفروع", en: "Branches" }, path: "/branches" },
        ])}
      />
      <BranchesClient branches={branches} banner={banner} />
    </>
  );
}
