import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ResultsClient } from "@/components/pages/ResultsClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/results",
  title: { ar: "النتائج — قبل وبعد وما يمكن توقعه", en: "Results — Before & After" },
  description: {
    ar: "أمثلة تمثيلية لنتائج جلسات عيادات شامه مع جدول واقعي يوضح مدة كل جلسة وعدد الجلسات وبداية ظهور النتيجة والسعر لكل خدمة تجميلية.",
    en: "Representative results from Shamah Clinics with a realistic table of session length, count, onset and price for every aesthetic treatment.",
  },
  image: "/images/skin-glow.jpg",
});

export default function ResultsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "النتائج", path: "/results" },
        ])}
      />
      <ResultsClient />
    </>
  );
}
