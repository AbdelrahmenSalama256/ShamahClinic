import { cookies, headers } from 'next/headers';
import { LoadingSplash } from '@/components/ui/LoadingSplash';
import { message } from '@/lib/console/messages';
import { PREFS_COOKIE, resolvePrefs } from '@/lib/console/prefs';

/**
 * The workspace's own loading state: the frame is already on screen. It reads the prefs
 * cookie directly rather than `consoleView`, because loading UI must not wait on the database
 * it is covering for.
 */
export default async function ConsoleLoading() {
  const store = await cookies();
  const prefs = resolvePrefs({
    cookie: store.get(PREFS_COOKIE)?.value,
    acceptLanguage: (await headers()).get('accept-language'),
  });

  return (
    <div className="console-content" aria-label={message('state.loading', prefs.locale)}>
      <LoadingSplash />
    </div>
  );
}
