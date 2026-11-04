import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";
import { getAboutPage } from "@/lib/content/about-page";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getAboutPage();
  return buildPageMetadata({
    path: "/about",
    ...SITE_SEO["/about"],
    image: page?.hero?.src || "/images/clinic-reception.jpg",
  });
}

/**
 * The page the owner published at `/about`, and nothing else.
 *
 * The reader answers from the row's published twin only, so a draft saved in the console
 * cannot reach a visitor, and a route with no published row answers `notFound()` instead of
 * printing words nobody wrote.
 */
export default async function AboutPage() {
  await guardPage('about');
  const page = await getAboutPage();
  if (!page) notFound();

  return (
    <>
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: page.title, path: "/about" },
        ])}
      />
      <AboutClient page={page} />
    </>
  );
}
