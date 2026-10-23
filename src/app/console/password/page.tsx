import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PasswordForm } from '@/components/console/PasswordForm';
import { Alert } from '@/components/ui/Status';
import { message, type MessageKey } from '@/lib/console/messages';
import { consoleView } from '@/lib/console/server';

export const dynamic = 'force-dynamic';

const LABELS: readonly MessageKey[] = [
  'password.current',
  'password.next',
  'password.submit',
  'password.saved',
  'password.weak',
  'password.wrong_current',
  'login.invalid_input',
];

/**
 * Outside the shell on purpose: an account still holding a temporary password is
 * redirected here by the workspace layout, and it must be able to finish without
 * navigating through screens the guard would refuse.
 */
export default async function ConsolePasswordPage() {
  const { auth, prefs } = await consoleView();
  if (!auth) redirect('/console/login');

  const labels = Object.fromEntries(LABELS.map((key) => [key, message(key, prefs.locale)])) as Record<MessageKey, string>;

  return (
    <main className="console-center">
      <section className="console-login">
        <h1 className="console-heading">{message('password.heading', prefs.locale)}</h1>
        {auth.user.mustChangePassword ? (
          <Alert tone="danger">{message('password.must_change', prefs.locale)}</Alert>
        ) : (
          <p className="console-lede">
            <Link href="/console">{message('nav.overview', prefs.locale)}</Link>
          </p>
        )}
        <p className="console-lede">{message('password.intro', prefs.locale)}</p>
        <PasswordForm labels={labels} />
      </section>
    </main>
  );
}
