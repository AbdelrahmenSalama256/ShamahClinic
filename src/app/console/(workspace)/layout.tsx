import { redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import { visibleScreens } from '@/lib/console/screens';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

/**
 * Everything except the two screens that exist before you have a usable session —
 * login and the forced password change — renders inside the shell.
 */
export default async function ConsoleWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { auth, prefs } = await consoleView();
  if (!auth) redirect('/console/login');
  if (auth.user.mustChangePassword) redirect('/console/password');

  return (
    <ConsoleShell prefs={prefs} user={auth.user} screens={visibleScreens(auth.user.grants)}>
      {children}
    </ConsoleShell>
  );
}
