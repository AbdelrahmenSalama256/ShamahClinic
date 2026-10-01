import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { BranchesClient } from "@/components/pages/BranchesClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/branches",
  title: { ar: "الفروع — مدينة نصر والتجمع والشيخ زايد", en: "Our Branches" },
  description: {
    ar: "فروع عيادات شامه الثلاثة في القاهرة والجيزة: مدينة نصر (عباس العقاد)، التجمع الخامس (ميديكال بارك)، والشيخ زايد (تريفيوم مول). عناوين وأرقام هاتف كل فرع ومواعيد العمل.",
    en: "Shamah Clinics' three branches in Cairo and Giza: Nasr City, Fifth Settlement (Medical Park) and Sheikh Zayed (Trivium Mall). Addresses, phone numbers and opening hours.",
  },
  image: "/images/branch-interior.jpg",
});

export default function BranchesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "الفروع", path: "/branches" },
        ])}
      />
      <BranchesClient />
    </>
  );
}
