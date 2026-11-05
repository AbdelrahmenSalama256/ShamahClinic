import { Empty } from '@/components/console/kit';
import { TextsScreen } from '@/components/console/TextsScreen';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { textsCenterData } from '@/lib/console/texts-center';
import type { ContentLocale } from '@/lib/content/kinds';
import type { ConsoleLocale } from '@/lib/console/prefs';

export const dynamic = 'force-dynamic';

interface Props {
  /** `?locale=` chooses which language's sentences the screen is editing. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function askedLocale(value: string | string[] | undefined, fallback: ConsoleLocale): ContentLocale {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === 'ar' || text === 'en') return text;
  return fallback === 'en' ? 'en' : 'ar';
}

/**
 * The site's sentences, in one screen. The rows come from the components — `npm run
 * copy:catalog` writes them into `src/lib/copy/catalog.ts` at build time — so a sentence
 * that was always there is editable here without anybody adding a row first. The language
 * is a URL parameter because a shared link to the Arabic wording has to open on the Arabic
 * wording.
 */
export default async function ConsoleTextsPage({ searchParams }: Props) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  // The same grant the page screens use: this is the words of a page, not a new kind of
  // thing, and a role that may read pages may read them here.
  if (!can(auth.user.grants, 'page', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const params = await searchParams;
  const locale = askedLocale(params.locale, prefs.locale);
  const data = await textsCenterData({ grants: auth.user.grants, locale });
  if (!data) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  return (
    <>
      <h1 className="console-heading">{message('nav.texts', prefs.locale)}</h1>
      <TextsScreen key={locale} data={data} labels={catalogFor(prefs.locale)} />
    </>
  );
}
