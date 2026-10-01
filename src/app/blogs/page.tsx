import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { JournalClient } from "@/components/pages/JournalClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/blogs",
  title: {
    ar: "المقالات— مقالات العناية بالبشرة والتجميل",
    en: "Journal — Skincare & Aesthetics Articles",
  },
  description: {
    ar: "مقالات طبية مبسطة من طبيبات عيادات شامه: حقائق عن ليزر إزالة الشعر، روتين العناية الشتوي بالبشرة الجافة، والفرق بين البوتوكس والفيلر.",
    en: "Clear medical articles from Shamah's doctors: laser hair removal facts, a winter routine for dry skin, and the difference between Botox and filler.",
  },
  image: "/images/blog-flatlay.jpg",
});

export default function JournalPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "المقالات", path: "/blogs" },
        ])}
      />
      <JournalClient />
    </>
  );
}
