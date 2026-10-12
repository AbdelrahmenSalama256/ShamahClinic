import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ContactClient } from "@/components/pages/ContactClient";
import { getBranchList } from "@/lib/wp";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/contact",
    title: { ar: "تواصلي معنا — حجز موعد واستفسار", en: "Contact & Booking" },
    description: {
      ar: "تواصلي مع عيادات شامه عبر واتساب أو الهاتف أو البريد، أو احجزي موعدكِ مباشرة. أرقام الفروع الثلاثة في مدينة نصر والتجمع الخامس والشيخ زايد ومواعيد العمل يومياً.",
      en: "Contact Shamah Clinics via WhatsApp, phone or email, or book your visit directly. Phone numbers for all three branches and daily opening hours.",
    },
    image: "/images/clinic-reception.jpg",
  });
}

export default async function ContactPage() {
  const branches = await getBranchList();
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "تواصلي", en: "Contact" }, path: "/contact" },
        ])}
      />
      <ContactClient branches={branches} />
    </>
  );
}
