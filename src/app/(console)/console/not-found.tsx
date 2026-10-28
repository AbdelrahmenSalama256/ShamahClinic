import Link from 'next/link';
import { message } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

/**
 * A console URL that names no screen (`/console/whatever`) is answered here. The file sits
 * inside the console's own root layout, so the 404 arrives with the console's palette and
 * direction — never the site's header, footer or Tailwind sheet.
 */
export default async function ConsoleNotFound() {
  const { prefs } = await consoleView();

  return (
    <main className="console-center">
      <section className="console-login">
        <p className="console-lede">{message('brand.subtitle', prefs.locale)}</p>
        <h1 className="console-heading">{message('state.not_found.title', prefs.locale)}</h1>
        <p className="console-lede">{message('state.not_found.body', prefs.locale)}</p>
        <div className="console-controls">
          <Link className="console-btn" data-variant="primary" href="/console">
            {message('state.not_found.back', prefs.locale)}
          </Link>
        </div>
      </section>
    </main>
  );
}
