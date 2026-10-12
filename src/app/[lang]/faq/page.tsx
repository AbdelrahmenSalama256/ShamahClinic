import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/jsonld";
import { FaqClient } from "@/components/pages/FaqClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/faq",
    title: { ar: "الأسئلة الشائعة عن الليزر والتجميل", en: "Frequently Asked Questions" },
    description: {
      ar: "إجابات على أسئلتك عن ليزر إزالة الشعر، الفيلر والبوتوكس، الهيدرافيشل والتقشير، والحجز في عيادات شامه: عدد الجلسات، الألم، الأمان، الأسعار، والمواعيد.",
      en: "Answers to your questions about laser hair removal, fillers and Botox, HydraFacial and peels, and booking at Shamah: sessions, pain, safety, prices and hours.",
    },
    image: "/images/consultation.jpg",
  });
}

export default async function FaqPage() {
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
      <FaqClient />
    </>
  );
}
