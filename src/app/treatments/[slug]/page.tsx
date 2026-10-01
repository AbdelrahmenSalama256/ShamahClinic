import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/jsonld";
import { treatmentsData, getTreatment } from "@/data/treatments";
import { TreatmentDetailClient } from "@/components/pages/TreatmentDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return treatmentsData.map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const treatment = getTreatment(slug);
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
  const treatment = getTreatment(slug);
  if (!treatment) notFound();

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd(treatment),
          breadcrumbJsonLd([
            { name: "الرئيسية", path: "" },
            { name: "الخدمات", path: "/services" },
            { name: treatment.name.ar, path: `/treatments/${treatment.id}` },
          ]),
        ]}
      />
      <TreatmentDetailClient treatment={treatment} />
    </>
  );
}
