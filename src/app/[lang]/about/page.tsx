import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";
import { getAbout } from "@/lib/wp/about";
import { getBranchList } from "@/lib/content/site";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/about",
    title: { ar: "من نحن — قصة عيادات شامه وقيمها", en: "About Shamah Clinics" },
    description: {
      ar: "تعرّفي على قصة عيادات شامه لطب التجميل والليزر: فلسفتنا القائمة على الصدق والطب والخصوصية، وطاقم نسائي متخصص، وثلاثة فروع في القاهرة والجيزة.",
      en: "The story of Shamah Clinics: a philosophy built on honesty, medicine and privacy, an all-female specialist team, and three branches across Cairo and Giza.",
    },
    image: "/images/clinic-reception.jpg",
  });
}

export default async function AboutPage() {
  await guardPage('about');
  const [about, branches, treatments] = await Promise.all([
    getAbout(),
    getBranchList(),
    getMergedTreatments(),
  ]);
  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "من نحن", en: "About" }, path: "/about" },
        ])}
      />
      <AboutClient
        about={about}
        branchCount={branches.length}
        treatmentCount={treatments.length}
      />
    </>
  );
}
