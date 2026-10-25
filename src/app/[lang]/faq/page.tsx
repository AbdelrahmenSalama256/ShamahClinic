import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonld";
import { FaqClient } from "@/components/pages/FaqClient";
import { getPageTitle } from "@/lib/content/site";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/faq",
    ...SITE_SEO["/faq"],
    image: "/images/consultation.jpg",
  });
}

export default async function FaqPage() {
  await guardPage('faq');
  const title = await getPageTitle("faq", {
    ar: "الأسئلة الشائعة",
    en: "Frequently asked questions",
  });
  return (
    <>
      <JsonLd
        data={[
          await faqJsonLd(),
          await breadcrumbJsonLd([
            { name: { ar: "الرئيسية", en: "Home" }, path: "" },
            { name: { ar: "الأسئلة الشائعة", en: "FAQ" }, path: "/faq" },
          ]),
        ]}
      />
      <FaqClient title={title} />
    </>
  );
}
