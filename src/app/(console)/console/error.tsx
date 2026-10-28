'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { message } from '@/lib/console/messages';
import type { ConsoleLocale } from '@/lib/console/prefs';

/**
 * The fallback for an unexpected failure inside a console screen. It renders inside the
 * console's root layout, so it wears the console's palette — and it never prints the thrown
 * message: a stack fragment is a developer's word, not the owner's.
 */

/** An error boundary cannot await the server, so it reads the lang the console layout wrote.
 *  `useSyncExternalStore` keeps the server snapshot (Arabic) for hydration and swaps to the
 *  document's language on the client without a state-writing effect. */
const subscribe = (): (() => void) => () => {};
const readLocale = (): ConsoleLocale => (document.documentElement.lang === 'en' ? 'en' : 'ar');
const serverLocale = (): ConsoleLocale => 'ar';

export default function ConsoleError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const locale = useSyncExternalStore(subscribe, readLocale, serverLocale);

  return (
    <main className="console-center">
      <section className="console-login" role="alert">
        <p className="console-lede">{message('brand.subtitle', locale)}</p>
        <h1 className="console-heading">{message('state.error.title', locale)}</h1>
        <p className="console-lede">{message('state.error.body', locale)}</p>
        <div className="console-controls">
          <button type="button" className="console-btn" data-variant="primary" onClick={reset}>
            {message('state.error.retry', locale)}
          </button>
          <Link className="console-btn" href="/console">
            {message('state.not_found.back', locale)}
          </Link>
        </div>
      </section>
    </main>
  );
}
