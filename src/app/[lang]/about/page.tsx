import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { AboutClient } from "@/components/pages/AboutClient";
import { db } from "@/lib/db";
import { images } from "@/lib/images";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    path: "/about",
    ...SITE_SEO["/about"],
    image: "/images/clinic-reception.jpg",
  });
}

export default async function AboutPage() {
  await guardPage('about');
  // The public page reads ONLY the CMS row. `getPage()` previously fell back to the
  // WordPress snapshot, and this route's body was full of hard-coded strings; both
  // layers are removed here. If the row is absent the page intentionally does NOT
  // render hard-coded copy — a page without an author's words is a page that needs
  // one, and the owner is expected to publish the seeded row before opening the site.
  const [row] = await db
    .selectFrom('pages')
    .select(['data', 'pub_data', 'title_ar', 'title_en'])
    .where('route', '=', '/about')
    .execute();

  const structured = row ? (() => {
    const source = row.data ?? row.pub_data ?? null;
    if (!source) return null;
    try { return JSON.parse(typeof source === 'string' ? source : JSON.stringify(source)); }
    catch { return null; }
  })() : null;

  const about = row
    ? { title: { ar: row.title_ar, en: row.title_en }, lead: { ar: '', en: '' }, sections: [], structured }
    : { title: { ar: "", en: "" }, lead: { ar: "", en: "" }, sections: [], structured: null };

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
        branchCount={0}
        treatmentCount={0}
        banner={images.interiors.consultation}
      />
    </>
  );
}
