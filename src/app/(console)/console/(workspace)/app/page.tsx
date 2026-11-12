import { AppScreen } from '@/components/console/AppScreen';
import { Empty } from '@/components/console/kit';
import { can } from '@/lib/auth/permissions';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';
import { appOverview, redactOverview } from '@/lib/mobile/console';

export const dynamic = 'force-dynamic';

/** The mobile app's bookings and registered patients. Same grant as the leads screen. */
export default async function ConsoleAppPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) return null;

  const grants = auth.user.grants;
  if (!can(grants, 'lead', 'read', {})) return <Empty>{message('leads.no_permission', prefs.locale)}</Empty>;

  const data = redactOverview(await appOverview(), grants);
  const locale = prefs.locale === 'en' ? 'en' : 'ar';

  return (
    <>
      <h1 className="console-heading">{message('nav.app', prefs.locale)}</h1>
      <AppScreen initial={data} locale={locale} canWrite={can(grants, 'lead', 'update', { leadSources: 'app-booking' })} />
    </>
  );
}
