import { SettingsWorkspace } from '@/components/console/SettingsWorkspace';
import { can } from '@/lib/auth/permissions';
import { catalogFor, message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { readSettings } from '@/lib/content/settings';

export const dynamic = 'force-dynamic';

/**
 * Settings take effect as they are saved — there is no draft copy of a site
 * setting, so this screen has no publish step. Only Owner and Admin hold
 * `setting.update`; everyone else reads, and a secret never reaches either.
 */
export default async function ConsoleSettingsPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null; // the workspace layout has already redirected

  const grants = auth.user.grants;
  if (!can(grants, 'setting', 'read', {})) return <p className="console-lede">{message('content.no_permission', prefs.locale)}</p>;

  return (
    <>
      <h1 className="console-heading">{message('nav.settings', prefs.locale)}</h1>
      <SettingsWorkspace rows={await readSettings()} labels={catalogFor(prefs.locale)} canWrite={can(grants, 'setting', 'update', {})} />
    </>
  );
}
