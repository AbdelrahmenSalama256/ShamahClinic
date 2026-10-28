import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/console/LoginForm';
import { message, type MessageKey } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

/** The keys the form needs; a client component gets finished strings, never the catalog. */
const LABELS: readonly MessageKey[] = ['login.email', 'login.password', 'login.submit', 'login.waiting', 'login.invalid_credentials', 'login.account_disabled', 'login.throttled', 'login.invalid_input', 'login.network'];

export default async function ConsoleLoginPage() {
  const { auth, prefs } = await consoleView();
  if (auth) redirect('/console');

  const labels = Object.fromEntries(LABELS.map((key) => [key, message(key, prefs.locale)])) as Record<MessageKey, string>;

  return (
    <main className="console-center">
      <section className="console-login">
        <p className="console-lede">{message('brand.subtitle', prefs.locale)}</p>
        <h1 className="console-heading">{message('login.heading', prefs.locale)}</h1>
        <p className="console-lede">{message('login.intro', prefs.locale)}</p>
        <LoginForm labels={labels} />
      </section>
    </main>
  );
}
