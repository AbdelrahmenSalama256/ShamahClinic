import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ResultsClient } from "@/components/pages/ResultsClient";
import { getMergedTreatments } from "@/lib/wp/treatments";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/results",
    title: { ar: "النتائج — قبل وبعد وما يمكن توقعه", en: "Results — Before & After" },
    description: {
      ar: "أمثلة تمثيلية لنتائج جلسات عيادات شامه مع جدول واقعي يوضح مدة كل جلسة وعدد الجلسات وبداية ظهور النتيجة والسعر لكل خدمة تجميلية.",
      en: "Representative results from Shamah Clinics with a realistic table of session length, count, onset and price for every aesthetic treatment.",
    },
    image: "/images/skin-glow.jpg",
  });
}

export default async function ResultsPage() {
  const treatments = await getMergedTreatments();
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "النتائج", en: "Results" }, path: "/results" },
        ])}
      />
      <ResultsClient treatments={treatments} />
    </>
  );
}
