'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import type { MessageKey } from '@/lib/console/messages';

/** The login handler's error codes, mapped to the message that explains them. */
const ERRORS: Record<string, MessageKey> = {
  invalid_credentials: 'login.invalid_credentials',
  account_disabled: 'login.account_disabled',
  too_many_attempts: 'login.throttled',
  invalid_input: 'login.invalid_input',
};

export function LoginForm({ labels }: Readonly<{ labels: Record<MessageKey, string> }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/console/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const mapped = body?.error ? ERRORS[body.error] : undefined;
        setError(mapped ?? 'login.invalid_input');
        return;
      }
      router.push('/console');
      router.refresh();
    } catch {
      setError('login.network');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="console-panel" onSubmit={submit}>
      <Field label={labels['login.email']} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label={labels['login.password']} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" loading={busy}>
        {busy ? labels['login.waiting'] : labels['login.submit']}
      </Button>
      {error && (
        <p className="console-alert" data-tone="error" role="alert">
          {labels[error]}
        </p>
      )}
    </form>
  );
}
