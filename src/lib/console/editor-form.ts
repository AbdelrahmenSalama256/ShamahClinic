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
import type { Tone } from '@/components/console/kit';
import type { MessageKey } from './messages';
import type { FieldIssue } from './issues';
import { plainText } from '../content/format';
import { isOrderedKind, type ContentLocale } from '../content/kinds';
import {
  ALT_TARGET_KEYS,
  moveSharedAltInDoc,
  sharedAltApplies,
  sharedAltKeysOf,
  type AltStatus,
} from '../content/alt-migration';
import type { ContentRow, FieldView } from '../content/store';
import {
  listDocForm,
  listDocFromForm,
  listDocUnknown,
  listSchemaOf,
  UNKNOWN_FORM_KEY,
  type ListSchema,
} from '../content/list-schema';

export type FormValue = string | boolean;
export type Form = Record<string, FormValue>;

/** The row's state, as one chip. `pending` is the draft having outrun the published copy. */
export function contentStateKey(row: ContentRow): MessageKey {
  if (row.trashed) return 'content.state.trashed';
  // A row nobody has ever published has no unpublished changes: it is a draft.
  if (row.publishedAt && row.pendingLocales.length > 0) return 'content.state.pending';
  return row.status === 'draft' ? 'content.state.draft' : 'content.state.published';
}

/**
 * The chip's colour, read off the chip's word — one table for both panes.
 *
 * The list and the editor build this word from different objects (`ListSummary` carries
 * `pendingAr`/`pendingEn`, `ContentRow` carries `pendingLocales`), so they cannot share the
 * first function. They can share this one, which is the only way a row stops reading greener
 * in one pane than in the other.
 */
export function contentStateTone(key: MessageKey): Tone {
  if (key === 'content.state.trashed') return 'danger';
  if (key === 'content.state.pending') return 'warn';
  return key === 'content.state.published' ? 'ok' : 'neutral';
}

/** Pending in one language only: an Arabic edit must not flag the English tab. */
export function isPendingIn(field: FieldView, locale: ContentLocale): boolean {
  const published = field.pub?.[locale];
  return published !== null && published !== undefined && field.draft?.[locale] !== published;
}

/** The typed form a list row's document deserves, or null when its list has no schema. */
export function listSchemaOfRow(row: ContentRow): ListSchema | null {
  return row.kind === 'list_item' ? listSchemaOf(row.listKey) : null;
}

/** The column's JSON as a document, or null when it is not a document at all. */
function documentOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** A stored document the typed form cannot draw and therefore must not overwrite. */
function unformable(value: unknown): boolean {
  return value !== null && value !== undefined && documentOf(value) === null;
}

/** The entries a row's document holds that its list's form does not describe. */
function unknownOf(form: Form): Record<string, unknown> {
  const raw = String(form[UNKNOWN_FORM_KEY] ?? '');
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function formOf(row: ContentRow, locale: ContentLocale): Form {
  const out: Form = {};
  const schema = listSchemaOfRow(row);
  for (const [name, field] of Object.entries(row.fields)) {
    if (field.kind === 'bi') out[name] = field.draft?.[locale] ?? '';
    else if (field.kind === 'json') {
      // A list item's document is drawn as its list's own fields, never as JSON. The
      // entries the schema does not describe ride in a hidden key so the editor can
      // list them and refuse to save until a person removes them.
      if (schema) {
        const doc = documentOf(field.draftJson) ?? {};
        Object.assign(out, listDocForm(schema, doc));
        out[UNKNOWN_FORM_KEY] = JSON.stringify(listDocUnknown(schema, doc));
      } else {
        out[name] = JSON.stringify(field.draftJson ?? {}, null, 2);
      }
    } else if (field.kind === 'flag') out[name] = Boolean(field.value);
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

/**
 * The value a text field's format says the column should hold.
 *
 * A `plain` box is cleaned here with the server's own `plainText()`, so what the console
 * posts, what the preview shows and what the database stores are one string. Doing it on
 * every keystroke instead would fight the caret — typing `12 < 15` or a space between two
 * words would undo itself mid-sentence — so the box keeps the person's text until they
 * leave it, and the save is cleaned either way.
 */
export function storedValue(field: FieldView, value: FormValue | undefined): string {
  const text = String(value ?? '');
  return field.format === 'plain' ? plainText(text) : text;
}

/** The form as the site would read it: every plain field cleaned, the rest as typed. */
export function displayForm(row: ContentRow, form: Form): Form {
  const out: Form = {};
  const schema = listSchemaOfRow(row);
  for (const [name, field] of Object.entries(row.fields)) {
    if (schema && field.kind === 'json') {
      const doc = listDocFromForm(schema, form, unknownOf(form)).doc;
      Object.assign(out, listDocForm(schema, doc));
      continue;
    }
    out[name] = storedValue(field, form[name]);
  }
  return out;
}

/**
 * One row's answer to the click that moves a legacy shared description.
 *
 * `moveSharedAltInDoc()` works on a stored document; the person is looking at a form, where
 * the two descriptions they may already have typed live in their own boxes and the stale key
 * rides in the hidden `__unknown` entry. This is the same three rules with the boxes read from
 * where the editor keeps them, and it hands back a form the ordinary save path then writes —
 * so a failed save is reported by the save, not by a second copy of that logic here.
 *
 * `status: 'kept'` deliberately changes nothing: the shared sentence says something neither
 * half says, and the notice has to say that instead of deleting it.
 */
export function sharedAltMove(schema: ListSchema | null | undefined, form: Form): { form: Form; status: AltStatus; copied: string[] } {
  const unknown = unknownOf(form);
  if (!sharedAltApplies(schema) || sharedAltKeysOf(unknown).length === 0) return { form, status: 'nothing', copied: [] };

  const seeded: Record<string, unknown> = { ...unknown };
  for (const key of ALT_TARGET_KEYS) seeded[key] = String(form[key] ?? '');

  const moved = moveSharedAltInDoc(seeded);
  if (moved.status !== 'moved') return { form, status: moved.status, copied: moved.copied };

  const next: Form = { ...form };
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(moved.doc)) {
    if (ALT_TARGET_KEYS.includes(key)) next[key] = String(value ?? '');
    else rest[key] = value;
  }
  // The hidden entry keeps whatever else the row holds that the form cannot draw, minus the
  // legacy key this just moved. Re-serialising it is what unblocks the save.
  next[UNKNOWN_FORM_KEY] = JSON.stringify(rest);
  return { form: next, status: moved.status, copied: moved.copied };
}

/**
 * What a result row states that none of its fields complains about.
 *
 * A result now stands on its own: a title and two pictures are a story, and an article is an
 * optional link out of the card. So the two states the server cannot refuse and the page cannot
 * show are a row with neither a title nor an article — no name to draw — and a row with no
 * picture to draw at all. Half a before/after pair is a card that cannot make the comparison it
 * was typed for. The schema requires none of these, because the 57 rows imported from WordPress
 * would otherwise refuse to save, so the editor says it where the server stays silent.
 */
export function resultNotices(form: Form, rowKey: string): MessageKey[] {
  const out: MessageKey[] = [];
  const story = String(form.story ?? '').trim();
  const titled = [form.title_ar, form.title_en].some((value) => String(value ?? '').trim() !== '');
  const filled = ['before', 'after'].map((stem) => String(form[stem] ?? '').trim() !== '');
  // A row imported from WordPress is keyed by its article's old id, and the site has always
  // found that article through the number. Such a row is attached before the picker exists.
  const attached = story !== '' || /^\d+$/.test(rowKey);
  if (!attached && !titled) out.push('content.result.nameless');
  if (filled[0] !== filled[1]) out.push('content.result.pair');
  if (!attached && !(filled[0] && filled[1])) out.push('content.result.picture');
  return out;
}

/** Turn the form into the API's `fields` object, collecting what cannot be sent. */
export function fieldsFromForm(row: ContentRow, form: Form): ParsedForm {
  const fields: Record<string, unknown> = {};
  const issues: FieldIssue[] = [];
  const schema = listSchemaOfRow(row);

  for (const [name, field] of Object.entries(row.fields)) {
    // An authored order is moved, never typed. A save that re-posted the number the row was
    // opened with would undo a move a colleague made while this form sat open, and the person
    // who moved a service to the top would find it back at the bottom on their own save.
    if (name === 'position' && isOrderedKind(row.kind)) continue;
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
      if (schema) {
        // The browser builds the same canonical document the server will build, so a
        // required box left empty and a half-typed price are the same sentence here as
        // under the API — and no request carries a document the server would refuse.
        if (unformable(field.draftJson)) {
          // A column that holds an array or a bare string has no form to draw, and saving
          // the empty one it would draw would write over whatever the row really holds.
          issues.push({ path: name, message: 'expected an object or an array' });
        }
        const parsed = listDocFromForm(schema, form, unknownOf(form));
        fields[name] = parsed.doc;
        issues.push(...parsed.issues);
        continue;
      }
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
    fields[name] = storedValue(field, value);
  }

  return { fields, issues };
}
