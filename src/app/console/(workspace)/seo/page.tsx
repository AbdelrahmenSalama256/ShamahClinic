import { SeoCenter } from '@/components/console/SeoCenter';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { seoCenterData } from '@/lib/console/seo-center';
import type { ContentLocale } from '@/lib/content/kinds';
import type { ConsoleLocale } from '@/lib/console/prefs';

export const dynamic = 'force-dynamic';

interface Props {
  /** `?locale=` chooses which language's search results the screen is showing. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function askedLocale(value: string | string[] | undefined, fallback: ConsoleLocale): ContentLocale {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === 'ar' || text === 'en') return text;
  return fallback === 'en' ? 'en' : 'ar';
}

/**
 * Every address the site serves, in one screen. The data is built from the same reads the
 * public pages use, so an article that was just created appears here without a second
 * catalog to keep in step. The language is a URL parameter because a shared link to the
 * Arabic titles has to open on the Arabic titles.
 */
export default async function ConsoleSeoPage({ searchParams }: Props) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'seo', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const params = await searchParams;
  const locale = askedLocale(params.locale, prefs.locale);
  const data = await seoCenterData({ grants, locale });
  if (!data) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  return (
    <>
      <h1 className="console-heading">{message('nav.seo', prefs.locale)}</h1>
      <SeoCenter key={locale} data={data} labels={catalogFor(prefs.locale)} />
    </>
  );
}
