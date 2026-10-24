/**
 * Creating a row from the one thing a person types: its title.
 *
 * The console used to ask for the slug first, which made a copy editor invent a URL name
 * and then explain, in a support message, why it could not be changed. Now the title is
 * the input and the identity follows — `slug.ts` turns it into a slug (or a page route),
 * and the same value is written into the title column for the language tab being worked
 * in. A list item has no title column of its own, so its title becomes the label key the
 * list's sampled schema names.
 *
 * Uniqueness is decided here rather than by the driver's duplicate-key error: a second
 * item called "Laser" becomes `laser-2`, and only a caller who supplied an explicit key
 * (the import does) is told the key is taken instead of being silently renamed.
 */
import { CONTENT_LOCALES, kindSpec, type ContentKind, type ContentLocale } from './kinds';
import { identityForTitle, identityVariant } from './slug';
import { createRow, idForRowKey, saveDraft, type ContentRow, type StoreResult } from './store';
import { sampleListSchema } from './summary';

export interface TitledCreate {
  title: string;
  locale?: ContentLocale;
  listKey?: string;
  actorId: string;
  /** An explicit identity is kept as-is; only the import passes one. */
  key?: string;
}

const ATTEMPTS = 50;

export async function createTitledRow(kind: ContentKind, input: TitledCreate): Promise<StoreResult<ContentRow>> {
  const spec = kindSpec(kind);
  const title = input.title.trim();
  const locale: ContentLocale = input.locale && CONTENT_LOCALES.includes(input.locale) ? input.locale : 'ar';
  if (!title) return { ok: false, status: 400, code: 'title_required', issues: [{ path: 'title', message: 'required' }] };

  const base = input.key ? input.key.trim() : identityForTitle(kind, title);
  if (!base) return { ok: false, status: 400, code: 'title_required', issues: [{ path: 'title', message: 'required' }] };

  let identity = base;
  if (!input.key) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      identity = identityVariant(base, attempt);
      if (!(await idForRowKey(kind, identity, input.listKey))) break;
      if (attempt === ATTEMPTS) return { ok: false, status: 409, code: 'key_taken' };
    }
  }

  const created = await createRow(kind, { key: identity, listKey: input.listKey, actorId: input.actorId });
  if (!created.ok) return created;

  let fields: Record<string, unknown>;
  if (spec.scope === 'lists') {
    const schema = await sampleListSchema(input.listKey ?? '');
    const label = schema.labelKeys[locale] ?? (locale === 'ar' ? 'name_ar' : 'name_en');
    fields = { data: { [label]: title } };
  } else {
    const titleField = spec.bi.find((field) => field.name === 'title' || field.name === 'name');
    if (!titleField) return { ok: true, value: created.value };
    fields = { [titleField.name]: title };
  }

  const saved = await saveDraft(kind, { id: created.value.id, locale, fields, actorId: input.actorId });
  return saved.ok ? saved : { ok: false, status: saved.status, code: saved.code, issues: saved.issues };
}
