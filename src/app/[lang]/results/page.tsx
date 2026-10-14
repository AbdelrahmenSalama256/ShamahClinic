import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ResultsClient } from "@/components/pages/ResultsClient";
import { getResultStories } from "@/lib/wp/result-stories";
import { cardToUIArticle } from "@/lib/wp/ui";
import { getLocalizedHref } from "@/lib/locale";
import { SITE_URL } from "@/lib/site";
import { routeLang } from "@/lib/route-lang";

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const PER_PAGE = 9;

function pageHref(page: number, lang: "ar" | "en"): string {
  const qs = page > 1 ? `?page=${page}` : "";
  return `${SITE_URL}${getLocalizedHref("/results", lang)}${qs}`;
}

async function read(sp: Props["searchParams"]) {
  const s = await sp;
  const requested = Math.max(1, Number(s.page) || 1);
  const paged = await getResultStories({ page: requested, perPage: PER_PAGE });
  return { paged, page: paged.page };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = await routeLang();
  const base = await buildPageMetadata({
    path: "/results",
    title: { ar: "النتائج — ما ترويه العيادة عن جلساتها", en: "Results — What the Clinic Reports" },
    description: {
      ar: "مقالات عيادات شامه عن نتائج الجلسات، بعنوانها ومقتطفها وصورتها كما نشرتها العيادة.",
      en: "Shamah Clinics' own articles on treatment outcomes, with the title, excerpt and photo the clinic published.",
    },
    image: "/images/skin-glow.jpg",
  });

  const page = (await read(searchParams)).page;
  if (page <= 1) return base;
  const languages = base.alternates?.languages;
  return {
    ...base,
    alternates: {
      canonical: pageHref(page, lang),
      languages: {
        ...languages,
        ar: pageHref(page, "ar"),
        en: pageHref(page, "en"),
      },
    },
  };
}

export default async function ResultsPage({ searchParams }: Props) {
  const { paged, page } = await read(searchParams);
  const lang = await routeLang();

  return (
    <>
      {page > 1 ? <link rel="prev" href={pageHref(page - 1, lang)} /> : null}
      {paged.hasMore ? <link rel="next" href={pageHref(page + 1, lang)} /> : null}
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "النتائج", en: "Results" }, path: "/results" },
        ])}
      />
      <ResultsClient
        stories={paged.items.map((story) => cardToUIArticle(story.card))}
        page={paged.page}
        total={paged.total}
        totalPages={paged.totalPages}
      />
    </>
  );
}
