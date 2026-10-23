'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { consoleCall } from './client-api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Status';
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
      <Field label={labels['password.current']} htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label={labels['password.next']} htmlFor="next">
        <Input id="next" name="next" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" loading={busy}>
        {labels['password.submit']}
      </Button>
      {error && <Alert tone="danger">{labels[error]}</Alert>}
      {saved && <Alert tone="ok">{labels['password.saved']}</Alert>}
    </form>
  );
}
