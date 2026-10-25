'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { consoleCall } from './client-api';
import { Button } from '@/components/console/kit';
import type { ConsolePrefs } from '@/lib/console/prefs';

interface Labels {
  toLight: string;
  toDark: string;
  switchLocale: string;
}

/**
 * The two preferences in the header: light/dark and language. They are saved by a Route
 * Handler, not in localStorage: the next render — this one, after `refresh()` — comes
 * back with the other `dir` and the other colours from the server, so there is no flash
 * and no second source of truth.
 *
 * The search trigger lives in `ConsolePalette`, next to the dialog it opens; both use
 * `.console-tool`, so the header draws three controls of one size, radius and stroke.
 * `ConsoleFrame` renders this once, in the header, at every width: a phone keeps the same
 * two preferences one tap away instead of hiding them inside the drawer.
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

  const dark = prefs.theme === 'dark';

  return (
    <span className="console-controls">
      <Button
        size="icon"
        className="console-tool"
        disabled={busy}
        aria-label={dark ? labels.toLight : labels.toDark}
        title={dark ? labels.toLight : labels.toDark}
        onClick={() => save({ ...prefs, theme: dark ? 'light' : 'dark' })}
      >
        {dark ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          </svg>
        )}
      </Button>
      <Button
        size="icon"
        className="console-tool"
        disabled={busy}
        aria-label={labels.switchLocale}
        title={labels.switchLocale}
        onClick={() => save({ ...prefs, locale: prefs.locale === 'ar' ? 'en' : 'ar' })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      </Button>
    </span>
  );
}
