import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, serviceJsonLd } from "@/lib/jsonld";
import { getMergedTreatment, getMergedTreatments } from "@/lib/wp/treatments";
import { TreatmentDetailClient } from "@/components/pages/TreatmentDetailClient";

export const revalidate = 300;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

/** Every service the site serves, including the sections page 696 publishes that
 *  we do not author a row for. */
export async function generateStaticParams() {
  return (await getMergedTreatments()).map((t) => ({ slug: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const treatment = await getMergedTreatment(slug);
  if (!treatment) return {};

  return buildPageMetadata({
    path: `/services/${treatment.id}`,
    title: treatment.name,
    description: treatment.tagline,
    image: treatment.image.src,
  });
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  // `getMergedTreatment` is the variant that also pulls the treatment's own
  // WordPress page (885 for botox) into `body`, which the detail renders.
  const [treatment, all] = await Promise.all([
    getMergedTreatment(slug),
    getMergedTreatments(),
  ]);
  if (!treatment) notFound();

  const related = all
    .filter(
      (x) =>
        x.id !== treatment.id && (x.category === treatment.category || x.featured),
    )
    .slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          await serviceJsonLd(treatment),
          await breadcrumbJsonLd([
            { name: { ar: "الرئيسية", en: "Home" }, path: "" },
            { name: { ar: "الخدمات", en: "Services" }, path: "/services" },
            { name: treatment.name, path: `/services/${treatment.id}` },
          ]),
        ]}
      />
      <TreatmentDetailClient treatment={treatment} related={related} />
    </>
  );
}
