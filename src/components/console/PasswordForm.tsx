'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { consoleCall } from './client-api';
import type { MessageKey } from '@/lib/console/messages';

const ERRORS: Record<string, MessageKey> = {
  weak_password: 'password.weak',
  invalid_credentials: 'password.wrong_current',
};

export function PasswordForm({ labels }: Readonly<{ labels: Record<MessageKey, string> }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await consoleCall('/api/console/auth/password', 'POST', {
      current: String(form.get('current') ?? ''),
      next: String(form.get('next') ?? ''),
    });
    setBusy(false);
    if (result.error) {
      setError(ERRORS[result.error] ?? 'login.invalid_input');
      return;
    }
    setSaved(true);
    // The server now knows this account is no longer locked to a temporary
    // password, so refresh to let the workspace layout stop redirecting here.
    router.refresh();
  }

  return (
    <form className="console-panel" onSubmit={submit}>
      <div className="console-field">
        <label htmlFor="current">{labels['password.current']}</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="console-field">
        <label htmlFor="next">{labels['password.next']}</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required />
      </div>
      <button type="submit" className="console-button console-button-primary" disabled={busy}>
        {labels['password.submit']}
      </button>
      {error && (
        <p className="console-alert" data-tone="error" role="alert">
          {labels[error]}
        </p>
      )}
      {saved && (
        <p className="console-alert" role="status">
          {labels['password.saved']}
        </p>
      )}
    </form>
  );
}
