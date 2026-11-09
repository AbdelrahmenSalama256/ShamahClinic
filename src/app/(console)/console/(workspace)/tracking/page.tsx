import { TrackingWorkspace } from '@/components/console/TrackingWorkspace';
import { PromotionsPanel } from '@/components/console/PromotionsPanel';
import { getPromo } from '@/lib/content/brand';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { integrationHistory } from '@/lib/integrations/history';
import { sheetsView } from '@/lib/integrations/view';
import { readTrackingConfig } from '@/lib/tracking/server';

export const dynamic = 'force-dynamic';

/**
 * Marketing and the sheet connector, on one screen.
 *
 * The tags are saved as one settings document, so this page reads the saved rows and
 * hands them to the workspace as the initial state; nothing here renders a snippet, and
 * the public layout is the only place a tag is ever injected. The sheet view arrives
 * with the URL reduced and the token reduced to whether it exists.
 */
export default async function ConsoleTrackingPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'integration', 'read', {})) {
    return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;
  }

  const config = await readTrackingConfig();
  const [sheets, history] = await Promise.all([sheetsView(), integrationHistory()]);

  return (
    <>
      <h1 className="console-heading">{message('nav.tracking', prefs.locale)}</h1>
      <p className="console-lede">{message('tracking.intro', prefs.locale)}</p>
      <TrackingWorkspace
        config={config}
        sheets={sheets}
        history={history}
        locale={prefs.locale}
        labels={catalogFor(prefs.locale)}
        canWrite={can(grants, 'integration', 'update', {})}
      />
      <PromotionsPanel initial={await getPromo()} canWrite={can(grants, 'integration', 'update', {})} labels={catalogFor(prefs.locale)} />
    </>
  );
}
