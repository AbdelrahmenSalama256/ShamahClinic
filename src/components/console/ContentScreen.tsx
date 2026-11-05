import { redirect } from 'next/navigation';
import { ContentListScreen } from '@/components/console/ContentListScreen';
import { Empty } from '@/components/console/kit';
import { contentScreenData, type ContentScreenProps } from '@/lib/console/content-screen';
import { contentDetailPath } from '@/lib/console/paths';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { LIST_LABELS } from '@/lib/content/lists';
import { idForRowKey, listKeyOfItem } from '@/lib/content/store';

/**
 * The server half of a content list: who is asking, which page of rows they may read,
 * and the heading. Four kinds share it because the only difference between them is
 * which columns `src/lib/content/kinds.ts` says they have.
 *
 * A row is no longer an editor pane beside the list. Opening one navigates to
 * `/console/<kind>/<id>`, which is a page a colleague can link to, reload and keep in
 * their history — so the only work left here is the list.
 *
 * The old `?key=` links (the palette wrote them until now, and bookmarks still hold
 * them) are resolved to an id and redirected. A `?key=` nobody can resolve is not an
 * error: the list simply shows, because the row may have been deleted since.
 */
export async function ContentScreen({ kind, titleKey, listKey: pinned, search }: Readonly<ContentScreenProps>) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const asked = search?.key;
  const key = (Array.isArray(asked) ? asked[0] : asked)?.trim();
  if (key) {
    const list = search?.list;
    const fromQuery = Array.isArray(list) ? list[0] : list;
    const scope = pinned ?? fromQuery;
    const id = await idForRowKey(kind, key, scope);
    if (id && kind === 'list_item') {
      const owner = pinned ?? (await listKeyOfItem(id));
      if (owner) redirect(contentDetailPath(kind, id, owner));
    } else if (id) {
      redirect(contentDetailPath(kind, id));
    }
  }

  const data = await contentScreenData(kind, { grants: auth.user.grants, locale: prefs.locale, search, listKey: pinned });
  // With the grant missing, this screen has nothing else to say, so the sentence gets the
  // shape built for a pane that is entirely absence.
  if (!data) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  // A list section names its list in the heading, because the URL no longer carries a tab.
  const listLabel = (LIST_LABELS as Record<string, { ar: string; en: string } | undefined>)[pinned ?? ''];
  const heading = listLabel ? listLabel[prefs.locale] : message(titleKey, prefs.locale);

  return (
    <>
      <h1 className="console-heading">{heading}</h1>
      <ContentListScreen data={data} />
    </>
  );
}
