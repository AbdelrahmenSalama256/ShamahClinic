import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, articleJsonLd, articleFaqJsonLd } from "@/lib/jsonld";
import { getPost, getAllArticles } from "@/lib/content/site";
import { articleToUI, cardToUIArticle } from "@/lib/wp/ui";
import { prepareArticleBody } from "@/lib/content/article-body";
import { routeLang } from "@/lib/route-lang";
import type { Article } from "@/data/journal";
import { JournalArticleClient } from "@/components/pages/JournalArticleClient";
import { guardPage } from '@/lib/content/guard-page';

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
  const lang = await routeLang();
  const res = await getPost(slug);
  if (!res) return {};
  const ui = articleToUI(res.item, lang);
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
  await guardPage('blogs');
  const { slug } = await params;
  const lang = await routeLang();
  const res = await getPost(slug);
  if (!res) notFound();
  const ui = articleToUI(res.item, lang);

  // The body is prepared for the language the URL names, not zipped against the other
  // one by index: an Arabic page is an Arabic article. The same pass that cuts the body
  // into blocks gives the headings their addresses and the FAQ blocks their questions,
  // so the table of contents, the anchors and the structured data are one reading of
  // the author's HTML rather than three guesses about it.
  const prepared = prepareArticleBody(res.item.content[lang]);

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

  const jsonLd = [
    await articleJsonLd(ui),
    await breadcrumbJsonLd([
      { name: { ar: "الرئيسية", en: "Home" }, path: "" },
      { name: { ar: "المدونة", en: "Blog" }, path: "/blogs" },
      { name: ui.title, path: `/blogs/${ui.slug}` },
    ]),
  ];
  // A page with no FAQ block says so by not claiming one; an empty FAQPage node is a
  // structured-data entry that answers nothing.
  if (prepared.faqs.length) {
    jsonLd.push(articleFaqJsonLd(prepared.faqs, lang, `/blogs/${ui.slug}`));
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <JournalArticleClient article={ui} body={prepared.segments} toc={prepared.toc} related={related} />
    </>
  );
}
