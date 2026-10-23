import { ContentWorkspace } from '@/components/console/ContentWorkspace';
import { contentScreenData, type ContentScreenProps } from '@/lib/console/content-screen';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';

/**
 * The server half of a content screen: who is asking, which page of rows they may read,
 * and the heading. Four kinds share it because the only difference between them is
 * which columns `src/lib/content/kinds.ts` says they have.
 *
 * The whole query string arrives here as `search` rather than as four props, because
 * the view is one object (`?sort` without `?dir` means nothing on its own) and a page
 * that named each term would drift from the list the moment the list gains one.
 */
export async function ContentScreen({ kind, titleKey, search }: Readonly<ContentScreenProps>) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const data = await contentScreenData(kind, { grants: auth.user.grants, locale: prefs.locale, search });
  if (!data) return <p className="console-lede">{message('content.no_permission', prefs.locale)}</p>;

  return (
    <>
      <h1 className="console-heading">{message(titleKey, prefs.locale)}</h1>
      <ContentWorkspace data={data} />
    </>
  );
}
