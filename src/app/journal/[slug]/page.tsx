import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, articleJsonLd } from "@/lib/jsonld";
import { journalData, getArticle } from "@/data/journal";
import { JournalArticleClient } from "@/components/pages/JournalArticleClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return journalData.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};

  return buildPageMetadata({
    path: `/blogs/${article.slug}`,
    title: article.title,
    description: article.excerpt,
    image: article.image.src,
    type: "article",
  });
}

export default async function JournalArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <>
      <JsonLd
        data={[
          articleJsonLd(article),
          breadcrumbJsonLd([
            { name: "الرئيسية", path: "" },
            { name: "المدونة", path: "/blogs" },
            { name: article.title.ar, path: `/blogs/${article.slug}` },
          ]),
        ]}
      />
      <JournalArticleClient article={article} />
    </>
  );
}
