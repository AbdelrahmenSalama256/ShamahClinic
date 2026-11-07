import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JournalArticleClient } from '@/components/pages/JournalArticleClient';
import { JsonLd } from '@/components/seo/JsonLd';
import { consoleView } from '@/lib/console/server';
import { previewableArticle } from '@/lib/console/content-screen';
import { prepareArticleBody } from '@/lib/content/article-body';
import { getAllArticles, getDraftArticle } from '@/lib/content/site';
import { articleJsonLd, articleFaqJsonLd, breadcrumbJsonLd } from '@/lib/jsonld';
import { normalizeLang } from '@/lib/route-lang';
import { articleToUI, cardToUIArticle } from '@/lib/wp/ui';
import type { Article } from '@/data/journal';

/**
 * The page an article's *draft* would draw, rendered by the site itself.
 *
 * The console's preview pane paints a card (`@/lib/console/preview`), because a card is what an
 * offer or a result case is. An article is a whole page with a table of contents, collapsible
 * FAQ pairs and booking boxes, and a second drawing of that is a second implementation that can
 * disagree with the first — which is the one thing a preview must not do. So this route hands the
 * frame the same `JournalArticleClient` the public detail uses, fed by the same
 * `prepareArticleBody()` pass, on the row's draft instead of its published twin. The stylesheet
 * that arrives is the site's, never the console's.
 *
 * Four things keep it out of the site, exactly as the service preview keeps itself out:
 *  - it renders nothing without a console session that may read articles **in this language**,
 *    and a row that fails that test answers with the same 404 a wrong id already gave;
 *  - it tells crawlers to stay out and is in no sitemap;
 *  - it paints the draft notice across the top, so a preview is never mistaken for what a
 *    visitor is reading now;
 *  - it loads no console stylesheet.
 *
 * The `/blogs` listing's own visibility switch is deliberately not asked here, and neither is
 * the row's publish state: an owner who hid the listing still has to read the page they are
 * writing, and the article they most need to preview is the one they have never published.
 */
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: { absolute: normalizeLang(lang) === 'en' ? 'Draft preview' : 'معاينة مسودة' },
    robots: 'noindex,nofollow',
  };
}

export default async function ArticleDraftPreviewPage({ params }: Props) {
  const { lang: segment, id } = await params;
  const lang = normalizeLang(segment);
  if (!lang) notFound();

  const { auth } = await consoleView();
  if (!auth) notFound();
  const row = await previewableArticle(id, { grants: auth.user.grants, locale: lang });
  if (!row) notFound();

  const article = await getDraftArticle(id);
  if (!article) notFound();
  const ui = articleToUI(article, lang);

  // One reading of the draft, the same one the public page takes: the segments it renders, the
  // addresses its headings carry, and the questions its FAQ blocks speak all come from here.
  const prepared = prepareArticleBody(article.content[lang]);

  let related: Article[] = [];
  try {
    const all = await getAllArticles();
    related = all.filter((card) => card.slug !== ui.slug).slice(0, 3).map(cardToUIArticle);
  } catch {
    related = [];
  }

  const jsonLd = [
    await articleJsonLd(ui),
    await breadcrumbJsonLd([
      { name: { ar: 'الرئيسية', en: 'Home' }, path: '' },
      { name: { ar: 'المدونة', en: 'Blog' }, path: '/blogs' },
      { name: ui.title, path: `/blogs/${ui.slug}` },
    ]),
  ];
  if (prepared.faqs.length) jsonLd.push(articleFaqJsonLd(prepared.faqs, lang, `/blogs/${ui.slug}`));

  return (
    <>
      {/* The one sentence this page adds, in the site's own utilities. The margin is the notice's
          own clearance: `SiteShell` gives `<main>` 40px at phone and 100px at desktop while the
          fixed header is 69 and 108 tall, so an element flush to the top of the page paints the
          better part of its first line behind the header's glass. Every section of a real page
          carries its own padding and never notices; this sentence is the only thing here that
          sits flush. */}
      <p
        data-draft-preview="article"
        className="mt-[calc(69px-40px)] border-b-2 border-[var(--gold-end)] bg-[var(--text-primary)] px-4 py-2 text-center text-sm font-bold text-[var(--bg-primary)] lg:mt-[calc(108px-100px)]"
      >
        {lang === 'ar'
          ? 'معاينة مسودة: هذا ما ستعرضه الصفحة بعد النشر، وليس ما يعرضه الموقع الآن.'
          : 'Draft preview: this is what the page will show once published, not what the site serves now.'}
      </p>
      <JsonLd data={jsonLd} />
      <JournalArticleClient article={ui} body={prepared.segments} toc={prepared.toc} related={related} />
    </>
  );
}
