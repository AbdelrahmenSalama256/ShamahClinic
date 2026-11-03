import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TreatmentDetailClient } from '@/components/pages/TreatmentDetailClient';
import { consoleView } from '@/lib/console/server';
import { previewableRow } from '@/lib/console/content-screen';
import { getDraftServicePage } from '@/lib/content/service-page';
import { normalizeLang } from '@/lib/route-lang';

/**
 * The page a service row's *draft* would draw, rendered by the site itself.
 *
 * The console's preview pane has always been a card the console paints (`./preview.ts`),
 * because a card is what a result case or an offer is. A service row is a whole page, and a
 * second drawing of it is a second implementation that can disagree with the first — so this
 * route hands the frame the same `TreatmentDetailClient` the public detail uses, fed by the
 * row's draft document instead of its published twin, with its references resolved against
 * the offers, cases, doctors and questions the site publishes today.
 *
 * Four things keep it out of the site:
 *  - it renders nothing without a console session that may read the services list, and a row
 *    that fails that test answers with the same 404 a wrong id already gave;
 *  - it tells crawlers to stay out and is in no sitemap;
 *  - it paints the draft notice across the top, so a preview is never mistaken for what a
 *    visitor is reading now;
 *  - it loads no console stylesheet: the frame is the site's own document, and the console's
 *    chrome stays in the console.
 *
 * The `/services` listing's own visibility switch is deliberately not asked here. An owner who
 * hid the listing still has to be able to read the page they are writing.
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

export default async function ServiceDraftPreviewPage({ params }: Props) {
  const { lang: segment, id } = await params;
  const lang = normalizeLang(segment);
  if (!lang) notFound();

  const { auth } = await consoleView();
  if (!auth) notFound();
  const row = await previewableRow(id, { grants: auth.user.grants, listKey: 'services' });
  if (!row) notFound();

  // The draft, not `published`: the owner is looking at what they have written and not sent.
  const stored = row.fields.data?.draftJson;
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) notFound();
  const page = await getDraftServicePage(stored as Record<string, unknown>, row.key);
  if (!page) notFound();

  return (
    <>
      {/* The one sentence this page adds, in the site's own utilities — it is the difference
          between a preview and a public render, and it has to survive being opened in a tab of
          its own or printed on a screenshot.
          The margin is the notice's own clearance: `SiteShell` gives `<main>` 40px at phone and
          100px at desktop, and the fixed header is 69 and 108 tall, so an element flush to the
          top of the page paints the better part of its first line behind the header's glass.
          Every section of a real page carries its own padding and never notices; this sentence
          is the only thing on the route that sits flush. */}
      <p
        data-draft-preview="services"
        className="mt-[calc(69px-40px)] border-b-2 border-[var(--gold-end)] bg-[var(--text-primary)] px-4 py-2 text-center text-sm font-bold text-[var(--bg-primary)] lg:mt-[calc(108px-100px)]"
      >
        {lang === 'ar'
          ? 'معاينة مسودة: هذا ما ستعرضه الصفحة بعد النشر، وليس ما يعرضه الموقع الآن.'
          : 'Draft preview: this is what the page will show once published, not what the site serves now.'}
      </p>
      <TreatmentDetailClient page={page} />
    </>
  );
}
