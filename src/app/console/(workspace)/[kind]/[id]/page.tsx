import { notFound, redirect } from 'next/navigation';
import { ContentDetailScreen } from '@/components/console/ContentDetailScreen';
import { contentDetailPath } from '@/lib/console/paths';
import { knownListKeys, listKeyOfItem } from '@/lib/content/store';
import type { ContentKind } from '@/lib/content/kinds';

export const dynamic = 'force-dynamic';

/** The URL spells the screen, the way the nav does; the kind is the content model. */
const KIND_OF_SEGMENT: Record<string, ContentKind> = {
  articles: 'article',
  offers: 'offer',
  pages: 'page',
};

interface Props {
  /** `/console/articles/<id>`, or `/console/results/<id>` for a list item. */
  params: Promise<{ kind: string; id: string }>;
  /** `?locale=` keeps the language tab the row was opened from. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleContentDetailPage({ params, searchParams }: Props) {
  const { kind: segment, id } = await params;
  const search = await searchParams;

  // The old aggregate route still has detail links in bookmarks. Resolve the item's list
  // and hand the browser the section it lives in; a missing item is the same 404 as ever.
  if (segment === 'lists') {
    const listKey = await listKeyOfItem(id);
    if (!listKey) notFound();
    redirect(contentDetailPath('list_item', id, listKey));
  }

  const kind = KIND_OF_SEGMENT[segment];
  if (kind) return <ContentDetailScreen kind={kind} id={id} search={search} />;

  // A list's section is its key, checked against what is registered rather than hardcoded.
  if ((await knownListKeys()).includes(segment)) {
    return <ContentDetailScreen kind="list_item" id={id} listKey={segment} search={search} />;
  }

  notFound();
}
