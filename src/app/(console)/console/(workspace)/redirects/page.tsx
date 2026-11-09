import { RedirectsScreen } from '@/components/console/RedirectsScreen';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { listNotFound } from '@/lib/content/not-found-log';
import { listRedirects } from '@/lib/content/redirects';

export const dynamic = 'force-dynamic';

/**
 * Redirects and the 404 monitor. The 404 log is read defensively: on a database that has
 * not had its 016 table added yet, the rules still work and the tab says it is empty.
 */
export default async function ConsoleRedirectsPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'redirect', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const [redirects, notFound] = await Promise.all([listRedirects(), listNotFound().catch(() => [])]);

  return (
    <>
      <h1 className="console-heading">{message('nav.redirects', prefs.locale)}</h1>
      <RedirectsScreen
        redirects={redirects}
        notFound={notFound}
        can={{
          create: can(grants, 'redirect', 'create', {}),
          update: can(grants, 'redirect', 'update', {}),
          delete: can(grants, 'redirect', 'delete', {}),
        }}
        labels={catalogFor(prefs.locale)}
      />
    </>
  );
}
