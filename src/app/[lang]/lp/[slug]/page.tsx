import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { getAllOffers, getFaqList, getLandingPage } from "@/lib/content/site";
import { getMergedTreatments } from "@/lib/wp/treatments";
import { offerToUI } from "@/lib/wp/ui";
import { routeLang } from "@/lib/route-lang";
import { LandingClient } from "@/components/pages/LandingClient";

export const revalidate = 300;
export const dynamicParams = true;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

/**
 * An ad landing page from the console's "Ad landing pages" list. It is out of the index
 * unless its row says otherwise, and out of the sitemap always: a paid click arrives by
 * its link, and a crawler finding the same offer twice helps neither page.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getLandingPage(decodeURIComponent(slug));
  if (!page) return {};
  return buildPageMetadata({
    path: `/lp/${page.key}`,
    title: page.headline,
    description: page.subhead,
    image: page.image,
    noindex: !page.indexed,
  });
}

export default async function LandingPageRoute({ params }: Props) {
  const { slug } = await params;
  const page = await getLandingPage(decodeURIComponent(slug));
  if (!page) notFound();

  const lang = await routeLang();
  const [offers, treatments, faq] = await Promise.all([
    page.offers.length ? getAllOffers(lang) : Promise.resolve([]),
    page.services.length ? getMergedTreatments() : Promise.resolve([]),
    page.faq.length ? getFaqList() : Promise.resolve([]),
  ]);
  // In the order the row lists them, so the marketer decides which card leads.
  const pick = <T,>(keys: string[], items: T[], keyOf: (item: T) => string): T[] =>
    keys.flatMap((key) => items.filter((item) => keyOf(item) === key));

  return (
    <LandingClient
      page={page}
      offers={pick(page.offers, offers, (offer) => offer.slug).map(offerToUI)}
      treatments={pick(page.services, treatments, (treatment) => treatment.id)}
      faq={pick(page.faq, faq, (item) => item.id)}
    />
  );
}
