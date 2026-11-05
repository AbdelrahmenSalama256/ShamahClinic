/**
 * The visitor's answer, kept where a browser keeps an answer: `localStorage`, so a
 * return visit is not asked again. Nothing is loaded before the answer is "granted",
 * and the same key is read by the tag injector and by the components that report a
 * click, so the banner and the tags cannot disagree.
 */

export const CONSENT_STORAGE_KEY = 'shamah-consent';
export const CONSENT_EVENT = 'shamah:consent';

export type ConsentChoice = 'granted' | 'denied';

export function readConsent(storage: Pick<Storage, 'getItem'> | null | undefined): ConsentChoice | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(storage: Pick<Storage, 'setItem'> | null | undefined, choice: ConsentChoice): void {
  if (!storage) return;
  try {
    storage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    /* private mode: the tags stay off for this visit, which is the safe failure */
  }
}
