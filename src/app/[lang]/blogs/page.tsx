import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { JournalClient } from "@/components/pages/JournalClient";
import { getPosts, getCategories, getPageTitle } from "@/lib/content/site";
import { cardToUIArticle } from "@/lib/wp/ui";
import { getLocalizedHref } from "@/lib/locale";
import { SITE_URL } from "@/lib/site";
import { routeLang } from "@/lib/route-lang";

export const revalidate = 300;

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}

const PER_PAGE = 9;

/** `/blogs`, `/blogs?page=2` — always in the current language and keeping filters. */
function pageHref(page: number, lang: "ar" | "en", category?: string, search?: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString();
  return `${SITE_URL}${getLocalizedHref("/blogs", lang)}${qs ? `?${qs}` : ""}`;
}

async function read(sp: Props["searchParams"]) {
  const s = await sp;
  const page = Math.max(1, Number(s.page) || 1);
  // Concurrent, not sequential: each WordPress call has its own 8 s budget, so
  // awaiting one after the other doubles the worst-case wait when the origin stalls.
  const [paged, categories] = await Promise.all([
    getPosts({ page, perPage: PER_PAGE, category: s.category, search: s.search }),
    getCategories().catch(() => []),
  ]);
  // `paged.page` is the clamped page: ?page=99 renders (and must canonicalize) the
  // last real page, otherwise an out-of-range URL would duplicate page 11 under a
  // second canonical.
  return { paged, categories, page: paged.page, category: s.category, search: s.search };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const s = await searchParams;
  const lang = await routeLang();
  const base = await buildPageMetadata({
    path: "/blogs",
    title: {
      ar: "مدونة شامه — مقالات العناية بالبشرة والتجميل",
      en: "Shamah Blogs — Skincare & Aesthetics",
    },
    description: {
      ar: "مقالات طبية مبسطة من طبيبات عيادات شامه عن ليزر إزالة الشعر والعناية بالبشرة والبوتوكس والفيلر.",
      en: "Clear medical articles from Shamah's doctors on laser hair removal, skincare, Botox and fillers.",
    },
    image: "/images/blog-flatlay.jpg",
  });

  // A page-specific canonical; rel=prev/next is emitted as real <link> elements
  // in the body because Next 16 metadata no longer supports alternates.prev/next.
  const page = (await read(searchParams)).page;
  if (page <= 1 && !s.category && !s.search) return base;
  const languages = base.alternates?.languages;
  return {
    ...base,
    alternates: {
      canonical: pageHref(page, lang, s.category, s.search),
      languages: {
        ...languages,
        ar: pageHref(page, "ar", s.category, s.search),
        en: pageHref(page, "en", s.category, s.search),
      },
    },
  };
}

export default async function JournalPage({ searchParams }: Props) {
  const { paged, categories, category, search, page } = await read(searchParams);
  const lang = await routeLang();
  const title = await getPageTitle("journal", {
    ar: "مدونة شامه",
    en: "Shamah Blog",
  });

  return (
    <>
      {page > 1 ? <link rel="prev" href={pageHref(page - 1, lang, category, search)} /> : null}
      {paged.hasMore ? <link rel="next" href={pageHref(page + 1, lang, category, search)} /> : null}
      <JsonLd
        data={await breadcrumbJsonLd([
          { name: { ar: "الرئيسية", en: "Home" }, path: "" },
          { name: { ar: "المدونة", en: "Blog" }, path: "/blogs" },
        ])}
      />
      <JournalClient
        title={title}
        firstPage={paged.items.map(cardToUIArticle)}
        page={paged.page}
        perPage={paged.perPage}
        total={paged.total}
        totalPages={paged.totalPages}
        categories={categories}
        activeCategory={category}
        activeSearch={search}
      />
    </>
  );
}
