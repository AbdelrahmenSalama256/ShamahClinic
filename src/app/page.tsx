import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeBody } from "@/components/home/HomeBody";

export const metadata: Metadata = buildPageMetadata({
  path: "",
  title: {
    ar: "التجميل والليزر والعناية بالبشرة في القاهرة والجيزة",
    en: "Home — Shamah Clinics",
  },
  description: {
    ar: "عيادات شامه لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة. ثلاثة فروع بمدينة نصر والتجمع الخامس والشيخ زايد، بإشراف طبي نسائي كامل وأجهزة حديثة. احجزي استشارتكِ الآن.",
    en: "Shamah Clinics for aesthetic medicine, laser and skincare in Cairo and Giza. Three branches with an all-female medical team and modern devices.",
  },
});

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <HomeBody />
    </>
  );
}
