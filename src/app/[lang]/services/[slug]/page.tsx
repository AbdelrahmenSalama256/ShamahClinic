import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { servicePageJsonLd } from "@/lib/content/service-jsonld";
import { getMergedService, getMergedTreatment, getMergedTreatments } from "@/lib/wp/treatments";
import { getServicePage } from "@/lib/content/service-page";
import { TreatmentDetailClient } from "@/components/pages/TreatmentDetailClient";
import { routeLang } from "@/lib/route-lang";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

/** Every service the site serves, including the sections page 696 publishes that
 *  we do not author a row for. */
export async function generateStaticParams() {
  return (await getMergedTreatments()).map((t) => ({ slug: t.id }));
}

const filled = (value: { ar: string; en: string }): boolean => value.ar !== "" || value.en !== "";

/**
 * The document's own search metadata, in the language the URL asks for.
 *
 * Three authors can name one page, and they are asked in that order: the SEO center's record
 * for this address (which `buildPageMetadata` reads last of all, because a specialist who
 * corrected a title means it), then the box on the row itself, then the words the page is
 * built from — its name and its summary line. A row that fills neither box gets exactly the
 * tags it got before the box existed.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const content = await getMergedService(slug);
  if (!content) return {};
  // The merged card is the last rung for a photograph: a service whose snapshot section had a
  // picture, before anybody edited the row, keeps the image it shares today.
  const card = await getMergedTreatment(slug);
  const seo = content.seo;

  return buildPageMetadata({
    path: `/services/${content.key}`,
    title: filled(seo.title) ? seo.title : content.name,
    description: filled(seo.description) ? seo.description : content.intro,
    image: seo.ogImage || content.hero.image || card?.image.src || null,
    canonical: seo.canonical,
    noindex: seo.noindex,
  });
}

export default async function ServiceDetailPage({ params }: Props) {
  await guardPage('services');
  const { slug } = await params;
  // The page renders the typed document its author wrote; the merged card is only what the
  // listing's rules still need, and it is the variant that pulls the dashboard's long-form
  // body into `body` when the row has none of its own.
  const [page, treatment] = await Promise.all([
    getServicePage(slug),
    getMergedTreatment(slug),
  ]);
  if (!page || !treatment) notFound();

  // The schema is built from the page that is about to be drawn, so a section the row lost — an
  // offer nobody left bookable, a question somebody unpublished — is not claimed either.
  return (
    <>
      <JsonLd data={servicePageJsonLd(page, await routeLang())} />
      <TreatmentDetailClient page={page} />
    </>
  );
}
