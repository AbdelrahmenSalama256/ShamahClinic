import { RolesScreen } from '@/components/console/RolesScreen';
import { Empty } from '@/components/ui/Status';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { permissionCatalog } from '@/lib/users/catalog';
import { listRoles } from '@/lib/users/view';

export const dynamic = 'force-dynamic';

/**
 * The catalog is resolved on the server and handed to the screen as plain data, so the
 * browser never imports `roles.ts` (which carries a database client) and every word is
 * already in the console's language.
 */
export default async function ConsoleRolesPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null;

  const grants = auth.user.grants;
  if (!can(grants, 'role', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const roles = await listRoles();

  return (
    <>
      <h1 className="console-heading">{message('roles.heading', prefs.locale)}</h1>
      <RolesScreen
        initial={{ roles }}
        catalog={permissionCatalog(prefs.locale)}
        labels={catalogFor(prefs.locale)}
        locale={prefs.locale}
        canWrite={can(grants, 'role', 'update', {})}
      />
    </>
  );
}
