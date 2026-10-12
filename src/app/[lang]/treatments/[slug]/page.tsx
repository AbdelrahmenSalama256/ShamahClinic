import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/jsonld";
import { treatmentsData } from "@/data/treatments";
import { getMergedTreatment } from "@/lib/wp/treatments";
import { TreatmentDetailClient } from "@/components/pages/TreatmentDetailClient";

export const revalidate = 300;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export function generateStaticParams() {
  return treatmentsData.map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const treatment = await getMergedTreatment(slug);
  if (!treatment) return {};

  return buildPageMetadata({
    path: `/treatments/${treatment.id}`,
    title: treatment.name,
    description: treatment.tagline,
    image: treatment.image.src,
  });
}

export default async function TreatmentDetailPage({ params }: Props) {
  const { slug } = await params;
  const treatment = await getMergedTreatment(slug);
  if (!treatment) notFound();

  return (
    <>
      <JsonLd
        data={[
          await serviceJsonLd(treatment),
          await breadcrumbJsonLd([
            { name: { ar: "الرئيسية", en: "Home" }, path: "" },
            { name: { ar: "الخدمات", en: "Services" }, path: "/services" },
            { name: treatment.name, path: `/treatments/${treatment.id}` },
          ]),
        ]}
      />
      <TreatmentDetailClient treatment={treatment} />
    </>
  );
}
