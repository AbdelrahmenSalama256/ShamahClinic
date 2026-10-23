/**
 * The editor's form model, kept out of the component so it can be tested without React.
 *
 * A form is the flat `{ field: text | boolean }` object the fields draw, built from one
 * (row, language tab) pair. Two rules it has to hold:
 *
 * **A row is only ever edited in one locale.** A bilingual field's value in the form is
 * that tab's draft, and the write names the tab, because `parseWrites()` in
 * `../content/kinds.ts` only touches the column for the locale the request names — that
 * is what makes a one-language grant honest.
 *
 * **Nothing is posted that the browser already knows is wrong.** `fieldsFromForm()`
 * returns the same `{ path, message }` vocabulary the server uses, so a half-typed price
 * is stopped here with the sentence MariaDB would have answered with, and the field it
 * belongs under is the same either way. An issue is not a rejection of the whole save —
 * the other fields are still edited — but no request goes out while one is open.
 */
import type { MessageKey } from './messages';
import type { FieldIssue } from './issues';
import type { ContentLocale } from '../content/kinds';
import type { ContentRow, FieldView } from '../content/store';

export type FormValue = string | boolean;
export type Form = Record<string, FormValue>;

/** The row's state, as one chip. `pending` is the draft having outrun the published copy. */
export function contentStateKey(row: ContentRow): MessageKey {
  if (row.trashed) return 'content.state.trashed';
  // A row nobody has ever published has no unpublished changes: it is a draft.
  if (row.publishedAt && row.pendingLocales.length > 0) return 'content.state.pending';
  return row.status === 'draft' ? 'content.state.draft' : 'content.state.published';
}

/** Pending in one language only: an Arabic edit must not flag the English tab. */
export function isPendingIn(field: FieldView, locale: ContentLocale): boolean {
  const published = field.pub?.[locale];
  return published !== null && published !== undefined && field.draft?.[locale] !== published;
}

export function formOf(row: ContentRow, locale: ContentLocale): Form {
  const out: Form = {};
  for (const [name, field] of Object.entries(row.fields)) {
    if (field.kind === 'bi') out[name] = field.draft?.[locale] ?? '';
    else if (field.kind === 'json') out[name] = JSON.stringify(field.draftJson ?? {}, null, 2);
    else if (field.kind === 'flag') out[name] = Boolean(field.value);
    else out[name] = field.value === null || field.value === undefined ? '' : String(field.value);
  }
  return out;
}

/**
 * Dirty means "the form differs from what this editor last had from the server".
 *
 * The comparison is against the form object the *save posted*, not against the row the
 * response returned: MariaDB answers `12` for what the person typed as `12.0`, and a
 * baseline that had been re-read from the database would call the row dirty again — which
 * with autosave running would write it again, forever.
 */
export function sameForm(a: Form, b: Form): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (String(a[key] ?? '') !== String(b[key] ?? '')) return false;
  return true;
}

export interface ParsedForm {
  fields: Record<string, unknown>;
  issues: FieldIssue[];
}

/** Turn the form into the API's `fields` object, collecting what cannot be sent. */
export function fieldsFromForm(row: ContentRow, form: Form): ParsedForm {
  const fields: Record<string, unknown> = {};
  const issues: FieldIssue[] = [];

  for (const [name, field] of Object.entries(row.fields)) {
    const value = form[name];
    if (field.kind === 'flag') {
      fields[name] = Boolean(value);
      continue;
    }
    if (field.kind === 'number') {
      const text = String(value ?? '').trim();
      if (text === '') fields[name] = null;
      else {
        const parsed = Number(text);
        if (Number.isFinite(parsed)) fields[name] = parsed;
        else issues.push({ path: name, message: 'expected a number' });
      }
      continue;
    }
    if (field.kind === 'json') {
      const text = String(value ?? '').trim();
      if (text === '') {
        fields[name] = {};
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object') issues.push({ path: name, message: 'expected an object or an array' });
        else fields[name] = parsed;
      } catch {
        issues.push({ path: name, message: 'not valid JSON' });
      }
      continue;
    }
    fields[name] = String(value ?? '');
  }

  return { fields, issues };
}
