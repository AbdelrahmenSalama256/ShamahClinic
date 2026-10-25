import { redirect } from 'next/navigation';
import { ContentListScreen } from '@/components/console/ContentListScreen';
import { Empty } from '@/components/console/kit';
import { contentScreenData, type ContentScreenProps } from '@/lib/console/content-screen';
import { contentDetailPath } from '@/lib/console/paths';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { idForRowKey } from '@/lib/content/store';

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
export async function ContentScreen({ kind, titleKey, search }: Readonly<ContentScreenProps>) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const asked = search?.key;
  const key = (Array.isArray(asked) ? asked[0] : asked)?.trim();
  if (key) {
    const list = search?.list;
    const listKey = Array.isArray(list) ? list[0] : list;
    const id = await idForRowKey(kind, key, listKey);
    if (id) redirect(`${contentDetailPath(kind, id)}${listKey && kind === 'list_item' ? `?list=${encodeURIComponent(listKey)}` : ''}`);
  }

  const data = await contentScreenData(kind, { grants: auth.user.grants, locale: prefs.locale, search });
  // With the grant missing, this screen has nothing else to say, so the sentence gets the
  // shape built for a pane that is entirely absence.
  if (!data) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  return (
    <>
      <h1 className="console-heading">{message(titleKey, prefs.locale)}</h1>
      <ContentListScreen data={data} />
    </>
  );
}
