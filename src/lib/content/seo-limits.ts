/**
 * What "a good search result" means, as numbers. Kept apart from the database so the
 * browser can judge a field as it is typed without importing the console's read path.
 *
 * The limits are Google's display widths, not hard column sizes: the database accepts
 * far more, and a longer title is still saved — the screen's job is to say it will be
 * cut, not to refuse the words.
 */
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

export type SeoStatus = 'missing' | 'long' | 'ok';

export function seoStatus(value: string, max: number): SeoStatus {
  const text = value.trim();
  if (!text) return 'missing';
  return [...text].length > max ? 'long' : 'ok';
}

/** The worst of two fields, for the one-word summary on a row. */
export function worstStatus(...statuses: SeoStatus[]): SeoStatus {
  if (statuses.includes('missing')) return 'missing';
  if (statuses.includes('long')) return 'long';
  return 'ok';
}

export function seoLength(value: string): number {
  return [...value.trim()].length;
}
