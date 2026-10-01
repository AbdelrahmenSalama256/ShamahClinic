import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/about",
  title: { ar: "من نحن — قصة عيادات شامه وقيمها", en: "About Shamah Clinics" },
  description: {
    ar: "تعرّفي على قصة عيادات شامه لطب التجميل والليزر: فلسفتنا القائمة على الصدق والطب والخصوصية، وطاقم نسائي متخصص، وثلاثة فروع في القاهرة والجيزة.",
    en: "The story of Shamah Clinics: a philosophy built on honesty, medicine and privacy, an all-female specialist team, and three branches across Cairo and Giza.",
  },
  image: "/images/clinic-reception.jpg",
});

export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "من نحن", path: "/about" },
        ])}
      />
      <AboutClient />
    </>
  );
}
