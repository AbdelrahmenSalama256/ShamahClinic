import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { OffersClient } from "@/components/pages/OffersClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/offers",
  title: { ar: "العروض والباقات الموسمية", en: "Offers & Packages" },
  description: {
    ar: "باقات عيادات شامه الموسمية: باقة الإشراقة، باقة ليزر الجسم الكامل، وباقة البوتوكس والفيلر. وفّر حتى ٣٢٪ بأسعار نهائية وسارية في الفروع الثلاثة.",
    en: "Shamah Clinics seasonal packages: glow ritual, full-body laser pass, and Botox & filler duo. Save up to 32% with final prices valid across all three branches.",
  },
  image: "/images/treatment-hydrafacial.jpg",
});

export default function OffersPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "العروض", path: "/offers" },
        ])}
      />
      <OffersClient />
    </>
  );
}
