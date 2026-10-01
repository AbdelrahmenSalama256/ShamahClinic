import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonld";
import { FaqClient } from "@/components/pages/FaqClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/faq",
  title: { ar: "الأسئلة الشائعة عن الليزر والتجميل", en: "Frequently Asked Questions" },
  description: {
    ar: "إجابات على أسئلتك عن ليزر إزالة الشعر، الفيلر والبوتوكس، الهيدرافيشل والتقشير، والحجز في عيادات شامه: عدد الجلسات، الألم، الأمان، الأسعار، والمواعيد.",
    en: "Answers to your questions about laser hair removal, fillers and Botox, HydraFacial and peels, and booking at Shamah: sessions, pain, safety, prices and hours.",
  },
  image: "/images/consultation.jpg",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={[
          faqJsonLd(),
          breadcrumbJsonLd([
            { name: "الرئيسية", path: "" },
            { name: "الأسئلة الشائعة", path: "/faq" },
          ]),
        ]}
      />
      <FaqClient />
    </>
  );
}
