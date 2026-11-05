import { notFound } from 'next/navigation';
import { ContentDetail } from './ContentDetail';
import { Empty } from '@/components/console/kit';
import { contentDetailData, type ContentScreenProps } from '@/lib/console/content-screen';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import type { ContentKind } from '@/lib/content/kinds';

/**
 * One row, read on the server so the first paint holds the document.
 *
 * The address names the row by id, not by a `?key=` on a list screen: a row that lives on
 * page four is still one link, and a pasted link opens it directly. A list item's address
 * also names its list, so the same row cannot appear under two sections. A missing row — or
 * a list item opened under the wrong list — is a 404, the same answer the rest of the site
 * gives.
 */
export async function ContentDetailScreen({
  kind,
  id,
  listKey,
  search,
}: Readonly<{ kind: ContentKind; id: string; listKey?: string; search?: ContentScreenProps['search'] }>) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null;

  const result = await contentDetailData(kind, id, { grants: auth.user.grants, locale: prefs.locale, search, listKey });
  if (!result.ok) {
    if (result.reason === 'not_found') notFound();
    return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;
  }

  return <ContentDetail data={result.data} />;
}
