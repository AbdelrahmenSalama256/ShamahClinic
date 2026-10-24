import { notFound } from 'next/navigation';
import { ContentDetailScreen } from '@/components/console/ContentDetailScreen';
import type { ContentKind } from '@/lib/content/kinds';

export const dynamic = 'force-dynamic';

/** The URL spells the screen, the way the nav does; the kind is the content model. */
const KIND_OF_SEGMENT: Record<string, ContentKind> = {
  articles: 'article',
  offers: 'offer',
  pages: 'page',
  lists: 'list_item',
};

interface Props {
  /** `/console/articles/<id>`: the screen and the row it opens. */
  params: Promise<{ kind: string; id: string }>;
  /** `?locale=` keeps the language tab the row was opened from. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleContentDetailPage({ params, searchParams }: Props) {
  const { kind: segment, id } = await params;
  const kind = KIND_OF_SEGMENT[segment];
  if (!kind) notFound();
  return <ContentDetailScreen kind={kind} id={id} search={await searchParams} />;
}
