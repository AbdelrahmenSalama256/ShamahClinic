import { notFound } from 'next/navigation';
import { ContentDetailScreen } from '@/components/console/ContentDetailScreen';
import { idForRowKey } from '@/lib/content/store';

export const dynamic = 'force-dynamic';

interface Props {
  /** `?locale=` keeps the language tab the row was opened from. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The About page, opened by the route the site renders rather than by a row id.
 *
 * `/about` is one page with one document, so it earns its own door in the sidebar
 * instead of asking a person to find it inside the pages list. The row is looked up by
 * its route — the same key `pageDocSchema()` and the public reader use — and the editor
 * it opens is the shared one: the draft, the publish bar, the revisions and the preview
 * are the row's, not a second copy built for this page.
 */
export default async function ConsoleAboutPage({ searchParams }: Props) {
  const id = await idForRowKey('page', '/about');
  if (!id) notFound();
  return <ContentDetailScreen kind="page" id={id} search={await searchParams} />;
}
