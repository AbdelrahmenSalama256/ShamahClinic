import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbJsonLd, offerJsonLd } from '@/lib/jsonld';
import { getAllOffers, getOffer } from '@/lib/wp';
import { offerDetailToUI } from '@/lib/wp/ui';
import { OfferDetailClient } from '@/components/pages/OfferDetailClient';
import { routeLang } from '@/lib/route-lang';
import { SDSection } from '@/sitedash/runtime';

export const revalidate = 300;
export const dynamicParams = true;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export async function generateStaticParams() {
  const offers = await getAllOffers(await routeLang());
  return offers.map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const res = await getOffer(slug, await routeLang());
  if (!res) return {};
  const { item, seo } = res;

  return buildPageMetadata({
    path: `/offers/${item.slug}`,
    title: item.name,
    description: {
      ar: seo.ar?.description || item.excerpt.ar,
      en: seo.en.description || item.excerpt.en,
    },
    image: item.image || seo.en.ogImage || undefined,
  });
}

export default async function OfferDetailPage({ params }: Props) {
  const { slug } = await params;
  const res = await getOffer(slug, await routeLang());
  if (!res) notFound();
  const { item, seo } = res;

  const ui = offerDetailToUI(item);

  return (
    <>
      <SDSection id="offers-slug-[dynamic].json-ld">
        <JsonLd
          data={[
            await offerJsonLd({
              slug: item.slug,
              name: item.name,
              price: item.price,
              currency: item.currency,
              image: seo.en.ogImage || item.image,
              description: item.excerpt.en,
            }),
            await breadcrumbJsonLd([
              { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
              { name: { ar: 'العروض', en: 'Offers' }, path: '/offers' },
              { name: item.name, path: `/offers/${item.slug}` },
            ]),
          ]}
        />
      </SDSection>
      <SDSection id="offers-slug-[dynamic].offer-detail-client">
        <OfferDetailClient offer={ui} slug={item.slug} html={item.html} />
      </SDSection>
    </>
  );
}
