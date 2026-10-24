import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ContactClient } from "@/components/pages/ContactClient";
import { getBranchList } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { guardPage } from '@/lib/content/guard-page';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/contact",
    title: { ar: "تواصلي معنا — حجز موعد واستفسار", en: "Contact & Booking" },
    description: {
      ar: "تواصلي مع عيادات شامه عبر واتساب أو الهاتف، أو احجزي موعدكِ مباشرة. أرقام الفروع الثلاثة في مدينة نصر والتجمع الخامس والشيخ زايد.",
      en: "Contact Shamah Clinics on WhatsApp or by phone, or book your visit directly. Phone numbers for all three branches.",
    },
    image: "/images/clinic-reception.jpg",
  });
}

export default async function ContactPage() {
  await guardPage('contact');
  const [branches, treatments, banner] = await Promise.all([
    getBranchList(),
    getMergedTreatments(),
    getBanner('contact'),
  ]);
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "تواصلي", en: "Contact" }, path: "/contact" },
        ])}
      />
      <ContactClient branches={branches} services={treatments} banner={banner} />
    </>
  );
}
