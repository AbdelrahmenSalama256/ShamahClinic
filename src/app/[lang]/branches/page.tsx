import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { BranchesClient } from "@/components/pages/BranchesClient";
import { getBranchList } from "@/lib/wp";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/branches",
    title: { ar: "الفروع — مدينة نصر والتجمع والشيخ زايد", en: "Our Branches" },
    description: {
      ar: "فروع عيادات شامه الثلاثة في القاهرة والجيزة: مدينة نصر (عباس العقاد)، التجمع الخامس (ميديكال بارك)، والشيخ زايد (تريفيوم مول). عناوين وأرقام هاتف كل فرع.",
      en: "Shamah Clinics' three branches in Cairo and Giza: Nasr City, Fifth Settlement (Medical Park) and Sheikh Zayed (Trivium Mall). Addresses and phone numbers.",
    },
    image: "/images/branch-interior.jpg",
  });
}

export default async function BranchesPage() {
  const branches = await getBranchList();
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "الفروع", en: "Branches" }, path: "/branches" },
        ])}
      />
      <BranchesClient branches={branches} />
    </>
  );
}
