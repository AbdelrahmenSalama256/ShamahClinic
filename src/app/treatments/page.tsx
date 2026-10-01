import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { TreatmentsClient } from "@/components/pages/TreatmentsClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/services",
  title: {
    ar: "الخدمات التجميلية والليزر",
    en: "Aesthetic & Laser Services",
  },
  description: {
    ar: "تعرفي على خدمات عيادات شامه: إزالة الشعر بالليزر، الفيلر والبوتوكس، الهيدرافيشل، التقشير الكيميائي، البلازما PRP، والعناية بالبشرة. تفاصيل كل جلسة وأسعارها وعدد الجلسات.",
    en: "Explore Shamah Clinics services: laser hair removal, fillers and Botox, HydraFacial, chemical peels, PRP and skincare. Details, prices and session counts.",
  },
  image: "/images/treatment-laser.jpg",
});

export default function TreatmentsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "الخدمات", path: "/services" },
        ])}
      />
      <TreatmentsClient />
    </>
  );
}
