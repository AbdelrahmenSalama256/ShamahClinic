import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ContactClient } from "@/components/pages/ContactClient";

export const metadata: Metadata = buildPageMetadata({
  path: "/contact",
  title: { ar: "تواصلي معنا — حجز موعد واستفسار", en: "Contact & Booking" },
  description: {
    ar: "تواصلي مع عيادات شامه عبر واتساب أو الهاتف أو البريد، أو احجزي موعدكِ مباشرة. أرقام الفروع الثلاثة في مدينة نصر والتجمع الخامس والشيخ زايد ومواعيد العمل يومياً.",
    en: "Contact Shamah Clinics via WhatsApp, phone or email, or book your visit directly. Phone numbers for all three branches and daily opening hours.",
  },
  image: "/images/clinic-reception.jpg",
});

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "الرئيسية", path: "" },
          { name: "تواصلي", path: "/contact" },
        ])}
      />
      <ContactClient />
    </>
  );
}
