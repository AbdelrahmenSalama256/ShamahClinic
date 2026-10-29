import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { SITE_SEO } from "@/lib/content/seo-defaults";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ResultsClient } from "@/components/pages/ResultsClient";
import { getResultStories, type ResultStory } from "@/lib/content/site";
import { getBanner } from "@/lib/content/banners";
import { cardToUIArticle, toPhotoSlot } from "@/lib/wp/ui";
import type { ResultStoryView } from "@/components/pages/ResultsClient";
import { getLocalizedHref } from "@/lib/locale";
import { SITE_URL } from "@/lib/site";
import { routeLang } from "@/lib/route-lang";
import { guardPage } from '@/lib/content/guard-page';

export const revalidate = 300;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const PER_PAGE = 9;

function pageHref(page: number, lang: "ar" | "en"): string {
  const qs = page > 1 ? `?page=${page}` : "";
  return `${SITE_URL}${getLocalizedHref("/results", lang)}${qs}`;
}

/**
 * The story as the client draws it.
 *
 * The headline replaces the article's own title on the card because the owner wrote it for
 * this page, and both halves of a pair are made into slots together or not at all — the read
 * path already dropped a half pair, so a card here either shows a comparison or shows what the
 * row itself holds. A row with no article draws the same card with `article` left null.
 * Each half keeps the description written for it, so a screen reader names what it is looking
 * at rather than the same sentence twice.
 */
function storyView(story: ResultStory): ResultStoryView {
  return {
    key: story.key,
    article: story.card ? { ...cardToUIArticle(story.card), title: story.headline } : null,
    headline: story.headline,
    pair: story.pair
      ? { before: toPhotoSlot(story.pair.before, story.pair.beforeAlt), after: toPhotoSlot(story.pair.after, story.pair.afterAlt) }
      : null,
    area: story.area,
    sessions: story.sessions,
    caption: story.caption,
    note: story.note,
    service: story.service ? { label: story.service.name, href: story.service.href } : null,
  };
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
    ...SITE_SEO["/results"],
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
  await guardPage('results');
  const [{ paged, page }, banner] = await Promise.all([read(searchParams), getBanner('results')]);
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
        stories={paged.items.map(storyView)}
        page={paged.page}
        total={paged.total}
        totalPages={paged.totalPages}
        banner={banner}
      />
    </>
  );
}
