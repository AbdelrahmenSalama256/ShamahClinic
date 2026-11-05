import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE } from '../auth/env';
import { loadAuth, type AuthContext } from '../auth/sessions';
import { PREFS_COOKIE, resolvePrefs, type ConsolePrefs } from './prefs';

export interface ConsoleView {
  auth: AuthContext | null;
  prefs: ConsolePrefs;
}

/**
 * One place reads "who is asking" and "in which language", so the root layout, the
 * workspace chrome and each page cannot disagree about the direction of the HTML
 * they emit.
 */
export async function consoleView(): Promise<ConsoleView> {
  const store = await cookies();
  const acceptLanguage = (await headers()).get('accept-language');
  const auth = await loadAuth(store.get(SESSION_COOKIE)?.value);
  return {
    auth,
    prefs: resolvePrefs({ account: auth?.user ?? null, cookie: store.get(PREFS_COOKIE)?.value, acceptLanguage }),
  };
}
