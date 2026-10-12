import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, articleJsonLd } from "@/lib/jsonld";
import { getPost, getAllArticles } from "@/lib/wp";
import { articleToUI, cardToUIArticle } from "@/lib/wp/ui";
import type { Article } from "@/data/journal";
import { JournalArticleClient } from "@/components/pages/JournalArticleClient";

export const revalidate = 300;

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const articles = await getAllArticles();
    return articles.map((a) => ({ slug: a.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const res = await getPost(slug);
  if (!res) return {};
  const ui = articleToUI(res.item);
  return buildPageMetadata({
    path: `/blogs/${ui.slug}`,
    title: { ar: res.seo.ar?.title || ui.title.ar, en: res.seo.en.title || ui.title.en },
    description: {
      ar: res.seo.ar?.description || ui.excerpt.ar,
      en: res.seo.en.description || ui.excerpt.en,
    },
    image: ui.image.src || undefined,
    type: "article",
  });
}

export default async function JournalArticlePage({ params }: Props) {
  const { slug } = await params;
  const res = await getPost(slug);
  if (!res) notFound();
  const ui = articleToUI(res.item);

  let related: Article[] = [];
  try {
    const all = await getAllArticles();
    related = all
      .filter((a) => a.slug !== ui.slug)
      .slice(0, 3)
      .map(cardToUIArticle);
  } catch {
    related = [];
  }

  return (
    <>
      <JsonLd
        data={[
          await articleJsonLd(ui),
          await breadcrumbJsonLd([
            { name: { ar: "الرئيسية", en: "Home" }, path: "" },
            { name: { ar: "المدونة", en: "Blog" }, path: "/blogs" },
            { name: ui.title, path: `/blogs/${ui.slug}` },
          ]),
        ]}
      />
      <JournalArticleClient article={ui} related={related} />
    </>
  );
}
