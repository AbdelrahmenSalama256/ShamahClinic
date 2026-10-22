/**
 * One place for the console's browser-side calls: read the CSRF cookie the login
 * response set, and send it as the header `guard()` expects. `shamah_csrf` is not
 * HttpOnly precisely so this works; `shamah_session` is, and never appears here.
 */
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/auth/env';

export function csrfToken(): string {
  for (const pair of document.cookie.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export interface CallResult<T = unknown> {
  status: number;
  /** The `error` code the guard answers with, or null when the call succeeded. */
  error: string | null;
  /** The response body minus `error`, so a caller can read the row it just saved. */
  data: T | null;
}

function dataOf<T>(payload: unknown): T | null {
  if (payload === null || typeof payload !== 'object') return null;
  const rest = { ...(payload as Record<string, unknown>) };
  delete rest.error;
  return Object.keys(rest).length > 0 ? (rest as T) : null;
}

export async function consoleCall<T = unknown>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<CallResult<T>> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return { status: res.status, error: payload?.error ?? null, data: dataOf<T>(payload) };
}

/** A read: no CSRF header, because a GET writes nothing. */
export async function consoleRead<T>(path: string): Promise<CallResult<T>> {
  const res = await fetch(path, { method: 'GET', credentials: 'same-origin' });
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return { status: res.status, error: payload?.error ?? null, data: dataOf<T>(payload) };
}
