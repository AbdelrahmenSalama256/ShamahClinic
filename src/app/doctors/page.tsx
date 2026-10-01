import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { DoctorsClient } from "@/components/pages/DoctorsClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/doctors",
  title: { ar: "الأطباء والطبيبات", en: "Our Doctors" },
  description: {
    ar: "تعرّفي على طبيبات عيادات شامه: استشارية الجلدية والتجميل د. نورهان المصري، أخصائية الليزر د. سلمى عبد الله، وأخصائية العناية بالبشرة د. ريم الوكيل. طاقم نسائي بالكامل.",
    en: "Meet Shamah Clinics' all-female medical team: dermatology and aesthetics consultant Dr. Nourhan El-Masry, laser specialist Dr. Salma Abdallah, and skincare specialist Dr. Reem El-Wakeel.",
  },
  image: "/images/consultation.jpg",
});

export default function DoctorsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "الأطباء", path: "/doctors" },
        ])}
      />
      <DoctorsClient />
    </>
  );
}
