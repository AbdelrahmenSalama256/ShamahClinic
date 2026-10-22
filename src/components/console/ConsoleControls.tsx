'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { consoleCall } from './client-api';
import type { ConsolePrefs } from '@/lib/console/prefs';

interface Labels {
  viewSite: string;
  signOut: string;
  toLight: string;
  toDark: string;
  switchLocale: string;
}

/**
 * Theme and language are saved on the account, not in localStorage: the next
 * render — this one, after `refresh()` — comes back with the other `dir` and the
 * other colours from the server, so there is no flash and no second source of truth.
 */
export function ConsoleControls({ prefs, labels }: Readonly<{ prefs: ConsolePrefs; labels: Labels }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function save(next: ConsolePrefs) {
    setBusy(true);
    await consoleCall('/api/console/prefs', 'PATCH', next);
    router.refresh();
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await consoleCall('/api/console/auth', 'DELETE');
    // The cookies are already gone, so the login page renders without a session;
    // a client navigation keeps the SPA alive instead of reloading the world.
    router.replace('/console/login');
  }

  return (
    <span className="console-controls">
      <Link href="/" target="_blank" rel="noreferrer" className="console-button">
        {labels.viewSite}
      </Link>
      <button type="button" className="console-button" disabled={busy} onClick={() => save({ ...prefs, theme: prefs.theme === 'dark' ? 'light' : 'dark' })}>
        {prefs.theme === 'dark' ? labels.toLight : labels.toDark}
      </button>
      <button type="button" className="console-button" disabled={busy} onClick={() => save({ ...prefs, locale: prefs.locale === 'ar' ? 'en' : 'ar' })}>
        {labels.switchLocale}
      </button>
      <button type="button" className="console-button" disabled={busy} onClick={signOut}>
        {labels.signOut}
      </button>
    </span>
  );
}
