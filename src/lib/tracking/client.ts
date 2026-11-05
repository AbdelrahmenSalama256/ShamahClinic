/**
 * The browser half of tracking: inject a snippet once, and report an event only when
 * the visitor has said yes. Both live here so there is one module that knows how the
 * page talks to a vendor, and a component that reports a booking imports a function
 * instead of reaching for `window`.
 */
import { CONSENT_STORAGE_KEY, readConsent } from './consent';
import { dispatchEvent, type EventParams, type EventSink, type TrackingEvent } from './events';
import type { Snippet } from './snippets';

const injected = new Set<string>();

export function consentGranted(): boolean {
  if (typeof window === 'undefined') return false;
  return readConsent(window.localStorage) === 'granted';
}

/**
 * Append one snippet to `<head>`. A key of the snippet's own text makes a second call —
 * Strict Mode's double effect, a hot reload, a second mount — a no-op rather than a
 * second loader.
 */
export function injectSnippet(snippet: Snippet): void {
  if (typeof document === 'undefined') return;
  const key = `${snippet.src ?? ''}\n${snippet.inline}`;
  if (injected.has(key)) return;
  injected.add(key);
  if (snippet.src) {
    const loader = document.createElement('script');
    loader.async = true;
    loader.src = snippet.src;
    document.head.appendChild(loader);
  }
  const inline = document.createElement('script');
  inline.textContent = snippet.inline;
  document.head.appendChild(inline);
}

/** One conversion, in every vocabulary on the page. Silent until consent is granted. */
export function trackEvent(event: TrackingEvent, params: EventParams = {}): void {
  if (typeof window === 'undefined' || !consentGranted()) return;
  dispatchEvent(window as unknown as EventSink, event, params);
}

/** The banner sets this after answering, so this tab reacts without a reload. */
export function reopenConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* private mode: nothing was stored to clear */
  }
  window.dispatchEvent(new Event('shamah:consent'));
}
