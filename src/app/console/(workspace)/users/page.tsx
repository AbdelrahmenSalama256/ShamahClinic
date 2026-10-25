import { UsersScreen } from '@/components/console/UsersScreen';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { parseUsersView, usersScreenData } from '@/lib/users/view';

export const dynamic = 'force-dynamic';

interface Props {
  /** The URL names the view: `?q=`, `?status=`, `?role=`, `?page=`, `?per=`. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Accounts are configuration, not content: there is no draft, no publish step and no
 * editor split. The page loads one page of them on the server, and the screen re-reads
 * when a filter changes.
 */
export default async function ConsoleUsersPage({ searchParams }: Props) {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'user', 'read', {})) return <Empty>{message('content.no_permission', prefs.locale)}</Empty>;

  const data = await usersScreenData({
    view: parseUsersView(await searchParams),
    currentUserId: auth.user.id,
  });

  return (
    <>
      <h1 className="console-heading">{message('users.heading', prefs.locale)}</h1>
      <UsersScreen
        initial={data}
        labels={catalogFor(prefs.locale)}
        locale={prefs.locale}
        canWrite={can(grants, 'user', 'update', {})}
        canCreate={can(grants, 'user', 'create', {})}
      />
    </>
  );
}
