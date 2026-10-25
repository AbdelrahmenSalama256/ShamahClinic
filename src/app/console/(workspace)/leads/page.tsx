import { LeadsScreen } from '@/components/console/LeadsScreen';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { leadsScreenData, parseLeadsView } from '@/lib/leads/view';

export const dynamic = 'force-dynamic';

interface Props {
  /** The URL names the view: `?status=`, `?source=`, `?q=`, `?page=`, `?per=`. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A lead has no draft and no publish step, so this screen is a list and a detail pane
 * rather than the list/editor split the content screens use. The rows are redacted by
 * `leadRow()` before they leave the server: what a role may see is decided here, not in
 * the browser.
 */
export default async function ConsoleLeadsPage({ searchParams }: Props) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'lead', 'read', {})) return <Empty>{message('leads.no_permission', prefs.locale)}</Empty>;

  const data = await leadsScreenData({ view: parseLeadsView(await searchParams), grants });

  return (
    <>
      <h1 className="console-heading">{message('nav.leads', prefs.locale)}</h1>
      <LeadsScreen initial={data} labels={catalogFor(prefs.locale)} locale={prefs.locale} />
    </>
  );
}
