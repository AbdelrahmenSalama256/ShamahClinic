import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, offerJsonLd } from "@/lib/jsonld";
import { OffersClient } from "@/components/pages/OffersClient";
import { getOffers, getPageTitle } from "@/lib/content/site";
import { offerToUI } from "@/lib/wp/ui";
import { routeLang } from "@/lib/route-lang";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/offers",
    title: { ar: "العروض والباقات الموسمية", en: "Offers & Packages" },
    description: {
      ar: "عروض وباقات عيادات شامه الحالية بأسعارها الفعلية، سارية في فروع مدينة نصر والتجمع الخامس والشيخ زايد.",
      en: "Current Shamah Clinics offers and packages at their real prices, valid across the Nasr City, Fifth Settlement and Zayed branches.",
    },
    image: "/images/treatment-hydrafacial.jpg",
  });
}

export default async function OffersPage() {
  const lang = await routeLang();
  const [paged, title] = await Promise.all([
    getOffers({ perPage: 30 }, lang).catch(() => ({ items: [] })),
    getPageTitle("shop", { ar: "باقات وعروض الموسم", en: "Seasonal packages & offers" }),
  ]);
  const wpOffers = paged.items || [];
  const offers = wpOffers.map(offerToUI);

  const jsonLd = await Promise.all([
    breadcrumbJsonLd([
      { name: { ar: "الرئيسية", en: "Home" }, path: "" },
      { name: { ar: "العروض", en: "Offers" }, path: "/offers" },
    ]),
    ...wpOffers.map((o) =>
      offerJsonLd({
        slug: o.slug,
        name: o.name,
        price: o.price,
        currency: o.currency,
        image: o.image,
        description: o.excerpt[lang],
      }),
    ),
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <OffersClient offers={offers} title={title} />
    </>
  );
}
