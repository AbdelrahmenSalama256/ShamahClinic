/**
 * A3.1 — the row that still holds one description written for two pictures.
 *
 * A result case says what the before picture shows and what the after picture shows; one
 * sentence cannot name both. Rows written before that split — the WordPress import among them
 * — hold a single `alt`, and the typed form has no box for it: `parseListDoc()` refuses a key
 * its schema does not describe, so the row could not be saved at all, and the one control that
 * did exist printed the key in an unnamed red box with a Remove button that threw the sentence
 * away. The brief asks for the opposite: one click that moves the words into the two boxes, and
 * ONE notice that says what it is about.
 *
 * What is proven here is the three rules, the unblocked save, and the honest counts:
 *
 *   - **an empty box receives the words, a filled one keeps them** — checked per locale, so an
 *     Arabic-only description cannot be copied into the English box as if it were a translation;
 *   - **the legacy key goes only when its words survive**, and a row where they do not is
 *     returned untouched — same object reference, not a copy of the document;
 *   - **running the pass twice changes nothing**, which is what makes a retry after a dropped
 *     connection safe;
 *   - **a failed write is reported as a failure**: the row whose document still holds some other
 *     key the schema refuses comes back under `failed` with the store's own code, and is absent
 *     from `migrated`.
 *
 * The write is `saveDraft()`, so the published copy is compared as the stored text rather than
 * assumed: a migration that reached a visitor without a publish would be the loudest surprise
 * this console can produce. Applicability is read off the list's schema, not its key — a
 * `services` row, whose own `alt` field the form draws, is refused on both sides.
 *
 * What a node test cannot show is the click itself: that the notice appears above the form and
 * that its button saves is asserted at the source, and the painted screen is left for the
 * browser pass. Rows touched are `list_items` and `audit_log` in `shamah_cms_test`, every one
 * named `alt-${run}-…` and deleted in `afterAll`.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { loginHandler } from '../src/lib/auth/login';
import { syncRoles } from '../src/lib/auth/roles';
import { assignRole, createUser } from '../src/lib/auth/users';
import {
  ALT_HALVES,
  ALT_TARGET_KEYS,
  SHARED_ALT_STEM,
  isSharedAltKey,
  moveSharedAltInDoc,
  sharedAltApplies,
  sharedAltKeysOf,
} from '../src/lib/content/alt-migration';
import { listSchemaOf, UNKNOWN_FORM_KEY, type ListSchema } from '../src/lib/content/list-schema';
import { createRow, getRow, saveDraft, setTrashed, type ContentRow, type FieldView, type StoreResult } from '../src/lib/content/store';
import { publishRow } from '../src/lib/content/publish';
import { contentActionHandler } from '../src/lib/content/api';
import { fieldsFromForm, formOf, sharedAltMove } from '../src/lib/console/editor-form';
import { catalogFor } from '../src/lib/console/messages';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-a31-2026';
const key = (name: string): string => `alt-${run}-${name}`;
const actorIds: { id: string; email: string }[] = [];

/** The one sentence a row written before the split holds for both halves. */
const shared = { ar: 'وصف واحد للصورتين', en: 'One line written for both pictures' };
const beforeWords = { ar: 'قبل التقشير', en: 'Before the peel' };
const afterWords = { ar: 'بعد التقشير', en: 'After the peel' };

const legacyDoc = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  title_ar: 'نتيجة قديمة',
  title_en: 'A case from before the split',
  before: '/uploads/before.jpg',
  after: '/uploads/after.jpg',
  alt_ar: shared.ar,
  alt_en: shared.en,
  ...extra,
});

/** Both halves already written with words of their own — the case the move must not touch. */
const bothFilledDoc = (): Record<string, unknown> =>
  legacyDoc({
    beforeAlt_ar: beforeWords.ar,
    beforeAlt_en: beforeWords.en,
    afterAlt_ar: afterWords.ar,
    afterAlt_en: afterWords.en,
  });

/* ------------------------------------------------------------------ the rules --- */

describe('one shared description becomes two, without touching what is written', () => {
  it('fills both empty boxes and retires the legacy key', () => {
    const moved = moveSharedAltInDoc(legacyDoc());
    expect(moved.status).toBe('moved');
    expect([...moved.copied].sort()).toEqual([...ALT_TARGET_KEYS].sort());
    expect(moved.doc.beforeAlt_ar).toBe(shared.ar);
    expect(moved.doc.beforeAlt_en).toBe(shared.en);
    expect(moved.doc.afterAlt_ar).toBe(shared.ar);
    expect(moved.doc.afterAlt_en).toBe(shared.en);
    expect(sharedAltKeysOf(moved.doc)).toEqual([]);
    // The rest of the row is the row's own.
    expect(moved.doc.title_en).toBe('A case from before the split');
    expect(moved.doc.after).toBe('/uploads/after.jpg');
  });

  it('leaves a box that already has words alone', () => {
    const moved = moveSharedAltInDoc(legacyDoc({ beforeAlt_ar: beforeWords.ar, beforeAlt_en: beforeWords.en }));
    expect(moved.status).toBe('moved');
    expect(moved.copied).toEqual(['afterAlt_ar', 'afterAlt_en']);
    expect(moved.doc.beforeAlt_ar).toBe(beforeWords.ar);
    expect(moved.doc.beforeAlt_en).toBe(beforeWords.en);
    expect(moved.doc.afterAlt_en).toBe(shared.en);
  });

  it('copies a language only into its own box', () => {
    // An Arabic sentence is not an English translation. Copying it across would fill a blind
    // reader's English alt with words they cannot read and hide that the box was never filled.
    const arabicOnly = moveSharedAltInDoc({ alt_ar: shared.ar, beforeAlt_ar: '', beforeAlt_en: '', afterAlt_ar: '', afterAlt_en: '' });
    expect(arabicOnly.status).toBe('moved');
    expect(arabicOnly.copied).toEqual(['beforeAlt_ar', 'afterAlt_ar']);
    expect(arabicOnly.doc.beforeAlt_en).toBe('');
    expect(arabicOnly.doc.afterAlt_en).toBe('');
  });

  it('takes the words from whichever shape the row was written in', () => {
    const nested = moveSharedAltInDoc({ alt: { ar: shared.ar, en: shared.en } });
    expect(nested.status).toBe('moved');
    expect(nested.doc.beforeAlt_en).toBe(shared.en);
    const bare = moveSharedAltInDoc({ alt: shared.en });
    expect(bare.status).toBe('moved');
    expect(bare.doc.afterAlt_ar).toBe(shared.en);
    expect(sharedAltKeysOf(nested.doc)).toEqual([]);
    expect(sharedAltKeysOf(bare.doc)).toEqual([]);
  });

  it('keeps the key when its words would be lost', () => {
    const doc = bothFilledDoc();
    const moved = moveSharedAltInDoc(doc);
    expect(moved.status).toBe('kept');
    // Not a re-serialised copy: `kept` has to be provably "nothing was decided about your data".
    expect(moved.doc).toBe(doc);
    expect(moved.doc.alt_ar).toBe(shared.ar);
    expect(moved.copied).toEqual([]);
  });

  it('comes back unchanged when there is nothing to move', () => {
    const doc = { title_ar: 'عنوان', beforeAlt_ar: 'قبل', afterAlt_ar: 'بعد' };
    const first = moveSharedAltInDoc(doc);
    expect(first.status).toBe('nothing');
    expect(first.doc).toBe(doc);
    // The retry after a dropped connection: the second pass sees the document the first wrote.
    const again = moveSharedAltInDoc(moveSharedAltInDoc(legacyDoc()).doc);
    expect(again.status).toBe('nothing');
  });

  it('clears a shared key that holds only spaces', () => {
    const moved = moveSharedAltInDoc({ alt_ar: '   ', alt_en: '', beforeAlt_ar: 'قبل', beforeAlt_en: 'Before' });
    expect(moved.status).toBe('moved');
    expect(moved.copied).toEqual([]);
    expect(sharedAltKeysOf(moved.doc)).toEqual([]);
    expect(moved.doc.beforeAlt_ar).toBe('قبل');
  });

  it('names exactly the two boxes it writes', () => {
    expect(ALT_HALVES).toEqual(['beforeAlt', 'afterAlt']);
    expect(ALT_TARGET_KEYS).toEqual(['beforeAlt_ar', 'beforeAlt_en', 'afterAlt_ar', 'afterAlt_en']);
    expect(SHARED_ALT_STEM).toBe('alt');
    expect(['alt', 'alt_ar', 'alt_en'].every(isSharedAltKey)).toBe(true);
    expect(isSharedAltKey('beforeAlt_ar')).toBe(false);
    expect(isSharedAltKey('altx')).toBe(false);
  });
});

/* ------------------------------------------------- which list the action belongs to --- */

/** A list that has the split and no shared key, under a key no real list uses. */
const splitOnly: ListSchema = {
  key: 'synthetic-split',
  title: 'title',
  fields: [
    { type: 'text', stem: 'title', label: { ar: 'عنوان', en: 'Title' } },
    { type: 'text', stem: 'beforeAlt', label: { ar: 'قبل', en: 'Before' } },
    { type: 'text', stem: 'afterAlt', label: { ar: 'بعد', en: 'After' } },
  ],
};

const withShared: ListSchema = {
  ...splitOnly,
  fields: [...splitOnly.fields, { type: 'text', stem: 'alt', label: { ar: 'وصف', en: 'Description' } }],
};

describe('the action belongs to the list whose form has the split', () => {
  it('offers it for results, where the two boxes exist and the shared key does not', () => {
    expect(sharedAltApplies(listSchemaOf('results'))).toBe(true);
    expect(sharedAltApplies(splitOnly)).toBe(true);
  });

  it('refuses it where the schema already draws an `alt` box', () => {
    // `services` and `specialists` each have one picture and a real `alt` field. Moving that
    // key would delete a description the form is currently showing.
    expect(sharedAltApplies(withShared)).toBe(false);
    expect(sharedAltApplies(listSchemaOf('services'))).toBe(false);
    expect(sharedAltApplies(listSchemaOf('specialists'))).toBe(false);
  });

  it('refuses it for every list without both halves', () => {
    const noAfter: ListSchema = { ...splitOnly, fields: splitOnly.fields.filter((field) => field.stem !== 'afterAlt') };
    expect(sharedAltApplies(noAfter)).toBe(false);
    expect(sharedAltApplies(null)).toBe(false);
    expect(sharedAltApplies(undefined)).toBe(false);
    for (const listKey of ['branches', 'faq', 'nav']) {
      expect(sharedAltApplies(listSchemaOf(listKey)), listKey).toBe(false);
    }
  });
});

/* ------------------------------------------------------------- the form, unblocked --- */

function field(patch: Partial<FieldView> & { kind: FieldView['kind'] }): FieldView {
  return { pending: false, immediate: false, multiline: false, max: 0, ...patch };
}

/** A published results row whose document still holds the legacy key, as the console gets it. */
function rowWithDoc(doc: Record<string, unknown>, listKey = 'results'): ContentRow {
  return {
    id: randomUUID(),
    kind: 'list_item',
    key: key('form'),
    listKey,
    status: 'published',
    version: 3,
    trashed: false,
    updatedAt: '2026-10-01T08:00:00.000Z',
    publishedAt: '2026-10-01T08:00:00.000Z',
    pendingLocales: [],
    fields: {
      data: field({ kind: 'json', draftJson: doc }),
      position: field({ kind: 'number', value: 1 }),
      enabled: field({ kind: 'flag', value: true }),
    },
  };
}

const pathsOf = (row: ContentRow, form: Record<string, string | boolean>): string[] =>
  fieldsFromForm(row, form).issues.map((issue) => issue.path).sort();

const hiddenOf = (form: Record<string, string | boolean>): Record<string, unknown> => JSON.parse(String(form[UNKNOWN_FORM_KEY] ?? '{}')) as Record<string, unknown>;

describe('the notice unblocks the save it is standing over', () => {
  it('says the row cannot be saved, and then says it can', () => {
    const row = rowWithDoc(legacyDoc());
    const form = formOf(row, 'ar');
    // The message the owner used to get, with no action beside it.
    expect(pathsOf(row, form)).toEqual(['alt_ar', 'alt_en']);
    expect(hiddenOf(form)).toEqual({ alt_ar: shared.ar, alt_en: shared.en });

    const moved = sharedAltMove(listSchemaOf('results'), form);
    expect(moved.status).toBe('moved');
    expect(moved.form.beforeAlt_ar).toBe(shared.ar);
    expect(moved.form.afterAlt_en).toBe(shared.en);
    expect(hiddenOf(moved.form)).toEqual({});
    expect(pathsOf(row, moved.form)).toEqual([]);
    // Nothing else about the row moved, so the save posts the row the person was looking at.
    expect(moved.form.title_ar).toBe(form.title_ar);
    expect(moved.form.enabled).toBe(true);
  });

  it('touches nothing when the two boxes already say something else', () => {
    const row = rowWithDoc(bothFilledDoc());
    const form = formOf(row, 'ar');
    const moved = sharedAltMove(listSchemaOf('results'), form);
    expect(moved.status).toBe('kept');
    expect(moved.form).toBe(form);
    // Deliberately still blocked: the key is the owner's to remove, and the notice says so.
    expect(pathsOf(row, form)).toEqual(['alt_ar', 'alt_en']);
  });

  it('stays silent for a row with nothing to move, and for a list with no split', () => {
    const clean = rowWithDoc({ title_ar: 'عنوان', title_en: 'Title', beforeAlt_en: 'a', afterAlt_en: 'b' });
    const cleanForm = formOf(clean, 'ar');
    const quiet = sharedAltMove(listSchemaOf('results'), cleanForm);
    expect(quiet.status).toBe('nothing');
    expect(quiet.form).toBe(cleanForm);

    // A services row keeps its `alt` as a live field the form draws, which is exactly why the
    // move must not offer itself here: it would empty a box the person is looking at.
    const services = rowWithDoc(legacyDoc(), 'services');
    const servicesForm = formOf(services, 'ar');
    expect(servicesForm.alt_ar).toBe(shared.ar);
    expect(hiddenOf(servicesForm)).not.toHaveProperty('alt_ar');
    const refused = sharedAltMove(listSchemaOf('services'), servicesForm);
    expect(refused.status).toBe('nothing');
    expect(refused.form).toBe(servicesForm);
    expect(refused.form.alt_ar).toBe(shared.ar);
  });

  it('keeps every other problem in the document in front of the owner', () => {
    // The notice is about one key. A second key the schema does not know must still block the
    // save and still be named, or the migration would become a way to hide validation errors.
    const row = rowWithDoc(legacyDoc({ leftover_note: 'something an older screen wrote' }));
    const form = formOf(row, 'ar');
    expect(pathsOf(row, form)).toEqual(['alt_ar', 'alt_en', 'leftover_note']);
    const moved = sharedAltMove(listSchemaOf('results'), form);
    expect(moved.status).toBe('moved');
    expect(pathsOf(row, moved.form)).toEqual(['leftover_note']);
    expect(hiddenOf(moved.form)).toEqual({ leftover_note: 'something an older screen wrote' });
  });
});

/* ------------------------------------------------------------------ the words --- */

describe('one notice, named after what it does, in both languages', () => {
  const ar = catalogFor('ar');
  const en = catalogFor('en');
  const messages = [
    'content.alt.can_move',
    'content.alt.move',
    'content.alt.both_filled',
    'content.alt.moved',
    'content.alt.none',
    'content.alt.migrated',
    'content.alt.skipped',
    'content.alt.failed',
    'content.issues.other',
    'content.error.alt_migration_not_applicable',
  ] as const;

  it('has a sentence for every state the code can reach', () => {
    for (const messageKey of messages) {
      expect(ar[messageKey], messageKey).toBeTruthy();
      expect(en[messageKey], messageKey).toBeTruthy();
      expect(en[messageKey]).not.toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('calls the button by the two boxes it fills', () => {
    expect(en['content.alt.move']).toBe('Move to Before/After Descriptions');
    expect(en['content.alt.can_move']).toMatch(/shared by both pictures/i);
    expect(en['content.alt.can_move']).toMatch(/or write one per picture/i);
    // The other state is a different instruction, so it is a different sentence.
    expect(en['content.alt.both_filled']).not.toBe(en['content.alt.can_move']);
    expect(en['content.alt.both_filled']).toMatch(/Nothing was copied/i);
    expect(en['content.alt.both_filled']).toMatch(/remove the shared key/i);
    expect(en['content.alt.moved']).toMatch(/saved as a draft/i);
  });

  it('counts the three outcomes with three different words', () => {
    expect(new Set([en['content.alt.migrated'], en['content.alt.skipped'], en['content.alt.failed']]).size).toBe(3);
    expect(new Set([ar['content.alt.migrated'], ar['content.alt.skipped'], ar['content.alt.failed']]).size).toBe(3);
    expect(en['content.alt.none']).toMatch(/Nothing to move/i);
  });

  it('gives the leftover errors a heading instead of a bare red box', () => {
    expect(en['content.issues.other']).toMatch(/other/i);
    expect(en['content.error.alt_migration_not_applicable']).toMatch(/no shared description/i);
  });
});

/* ------------------------------------------------------- what the screens wire up --- */

describe('the notice and the bulk button are the ones the code actually draws', () => {
  const editor = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleEditor.tsx'), 'utf8');
  const list = readFileSync(join(process.cwd(), 'src', 'components', 'console', 'ConsoleList.tsx'), 'utf8');

  it('shows the editor state as one named alert with the move attached to it', () => {
    expect(editor).toContain('const altMove = useMemo(() => sharedAltMove(listSchema, form)');
    expect(editor).toContain("{labels[altMove.status === 'moved' ? 'content.alt.can_move' : 'content.alt.both_filled']}");
    expect(editor).toContain('onClick={() => void moveSharedAlt()}');
    // One click, then the ordinary save — so a failed write is reported by the save, not by a
    // second copy of that logic that could disagree with it.
    expect(editor).toContain("if (await save('manual', altMove.form)) setNotice({ tone: 'ok', key: 'content.alt.moved' })");
    // The unnamed danger box is gone: what is left of `other` is a labelled one.
    expect(editor).toMatch(/<Alert tone="danger">\s*<strong>\{labels\['content\.issues\.other'\]\}<\/strong>/);
  });

  it('names the shared key out of the error list and leaves the rest of it alone', () => {
    expect(editor).toContain('.filter((issue) => !altOwned || !isSharedAltKey(issue.path))');
    // `invalid` is deliberately still `parsed.issues.length > 0`: while the key is there the
    // save must not post a document the server would refuse.
    expect(editor).toContain('const invalid = parsed.issues.length > 0;');
  });

  it('puts the bulk verb behind the same schema test the server uses', () => {
    expect(list).toContain("const migratable = kind === 'list_item' && !scope.trash && sharedAltApplies(listSchemaOf(scope.listKey));");
    expect(list).toContain("{migratable && bulkable('migrate-alt') && (");
    expect(list).toContain('`${api}/bulk/migrate-alt${scopeQuery}`');
    expect(list).toContain("key: counts.migrated.length > 0 ? 'content.alt.moved' : 'content.alt.none'");
    // An empty response is a failed request, not a zero-everything result.
    expect(list).toMatch(/if \(!counts\) \{\s*setNotice\(\{ tone: 'danger', key: 'content\.error\.save' \}\)/);
    expect(list).toContain("{labels['content.alt.migrated']} <bdi>{notice.counts.migrated.length}</bdi>");
  });
});

/* --------------------------------------------------------- the guarded bulk route --- */

interface Session {
  id: string;
  email: string;
  token: string;
  csrf: string;
}

interface Counts {
  migrated: string[];
  skipped: { id: string; reason: string }[];
  failed: { id: string; code: string }[];
}

interface Reply {
  status: number;
  body: Record<string, unknown>;
  counts: Counts;
  error: string;
}

let owner = {} as Session;
let viewer = {} as Session;

function unwrap<T>(result: StoreResult<T>, what: string): T {
  if (!result.ok) throw new Error(`${what} failed: ${result.status} ${result.code} ${JSON.stringify(result.issues ?? '')}`);
  return result.value;
}

async function login(email: string): Promise<Session> {
  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.11' },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const line = cookies.find((cookie) => cookie.startsWith('shamah_session='));
  if (!line) throw new Error('login did not set a session cookie');
  const stored = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return {
    id: stored.id,
    email,
    token: decodeURIComponent(line.slice('shamah_session='.length).split(';')[0]),
    csrf: ((await res.json()) as { csrfToken: string }).csrfToken,
  };
}

async function migrate(who: Session, listKey: string | null, ids: string[], method: 'POST' | 'GET' = 'POST'): Promise<Reply> {
  const line = listKey ? `?list=${listKey}` : '';
  const res = await contentActionHandler(
    new Request(`http://localhost/api/console/content/list_item/bulk/migrate-alt${line}`, {
      method,
      headers: {
        cookie: `shamah_session=${who.token}`,
        [CSRF_HEADER]: who.csrf,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: method === 'POST' ? JSON.stringify({ ids }) : null,
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    status: res.status,
    body,
    error: String(body.error ?? ''),
    counts: {
      migrated: (body.migrated ?? []) as string[],
      skipped: (body.skipped ?? []) as { id: string; reason: string }[],
      failed: (body.failed ?? []) as { id: string; code: string }[],
    },
  };
}

/** The two stored documents as their own text, because "unchanged" has to mean byte for byte. */
async function stored(uid: string): Promise<{ draft: string; published: string; version: number; status: string }> {
  const row = await db
    .selectFrom('list_items')
    .select(['status', 'version'])
    .select(sql<string>`CAST(draft AS CHAR)`.as('draft_text'))
    .select(sql<string>`CAST(published AS CHAR)`.as('published_text'))
    .where('uid', '=', uid)
    .executeTakeFirstOrThrow();
  return { draft: row.draft_text, published: row.published_text, version: row.version, status: row.status };
}

async function ensureList(listKey: string): Promise<void> {
  const existing = await db.selectFrom('lists').select('id').where('list_key', '=', listKey).executeTakeFirst();
  if (existing) return;
  await db
    .insertInto('lists')
    .values({ id: randomUUID(), list_key: listKey, label: listKey, item_schema: JSON.stringify({}), reorderable: 1, is_article_collection: 0 })
    .execute();
}

/**
 * A row in the shape the import left behind.
 *
 * The typed store refuses a key its schema does not list — which is the whole defect — so the
 * legacy document is written over both columns after the row is published, exactly as
 * `tests/results-page.test.ts` writes the shape the WordPress importer produced.
 */
async function seedLegacyRow(listKey: string, name: string, doc: Record<string, unknown>): Promise<string> {
  const uid = key(name);
  // Each list names its row with a different field, and each requires it.
  const titled = listKey === 'specialists' ? { name: { ar: 'اسم', en: 'Name' } } : { title: { ar: 'عنوان', en: 'Title' } };
  const created = unwrap(await createRow('list_item', { key: uid, listKey, actorId: owner.id }), `create ${name}`);
  unwrap(
    await saveDraft('list_item', {
      id: created.id,
      locale: 'en',
      fields: { data: titled, position: 0, enabled: true },
      expectedVersion: created.version,
      actorId: owner.id,
    }),
    `save ${name}`,
  );
  unwrap(await publishRow('list_item', { id: created.id, locales: ['en'], actor: { id: owner.id, email: owner.email } }), `publish ${name}`);
  const json = JSON.stringify(doc);
  await db.updateTable('list_items').set({ draft: json, published: json }).where('uid', '=', uid).execute();
  return created.id;
}

async function purge(): Promise<void> {
  const ids = (await db.selectFrom('list_items').select('id').where('uid', 'like', `alt-${run}-%`).execute()).map((row) => row.id);
  await db.deleteFrom('list_items').where('uid', 'like', `alt-${run}-%`).execute();
  if (ids.length > 0) await db.deleteFrom('revisions').where('entity_id', 'in', ids).execute();
}

async function auditRows(email: string): Promise<number> {
  return (await db.selectFrom('audit_log').select('id').where('entity_id', '=', 'bulk.migrate-alt').where('actor_email', '=', email).execute()).length;
}

beforeAll(async () => {
  assertTestDb();
  await purge();
  await ensureList('results');
  await ensureList('specialists');

  await syncRoles({ dryRun: false, database: readDbConfig().database });
  const roles = new Map((await db.selectFrom('roles').select(['id', 'name']).execute()).map((role) => [role.name, role.id]));
  for (const name of ['Owner', 'Viewer'] as const) {
    const email = `alt-${run}-${name.toLowerCase()}@example.invalid`;
    const id = await createUser({ email, password: PASSWORD, name: `A3.1 ${name} ${run}` });
    await assignRole(id, roles.get(name) ?? '');
    actorIds.push({ id, email });
    const session = await login(email);
    if (name === 'Owner') owner = session;
    else viewer = session;
  }
});

afterAll(async () => {
  await purge();
  if (actorIds.length > 0) {
    const ids = actorIds.map((actor) => actor.id);
    await db.deleteFrom('sessions').where('user_id', 'in', ids).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', ids).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', ids).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', ids).execute();
    await db.deleteFrom('users').where('id', 'in', ids).execute();
  }
  await destroyDb();
});

describe('the bulk route moves the words and nothing else', () => {
  it('writes the draft, leaves the published copy alone, and unblocks the editor', async () => {
    const id = await seedLegacyRow('results', 'moved', legacyDoc());
    const before = await stored(key('moved'));
    expect(before.published).toContain('"alt_ar"');

    const reply = await migrate(owner, 'results', [id]);
    expect(reply.status).toBe(200);
    expect(reply.counts).toEqual({ migrated: [id], skipped: [], failed: [] });

    const after = await stored(key('moved'));
    expect(JSON.parse(after.draft)).toMatchObject({ beforeAlt_ar: shared.ar, afterAlt_en: shared.en });
    expect(JSON.parse(after.draft)).not.toHaveProperty('alt_ar');
    // The copy a visitor reads is moved by publish(), so a migration cannot reach the site.
    expect(after.published).toBe(before.published);
    expect(after.version).toBe(before.version + 1);
    expect(after.status).toBe('changed');

    const row = await getRow('list_item', id);
    if (!row) throw new Error('the row disappeared');
    const form = formOf(row, 'ar');
    expect(form.beforeAlt_ar).toBe(shared.ar);
    expect(fieldsFromForm(row, form).issues).toEqual([]);
  });

  it('files an audit row for the pass that wrote, and none for the pass that did not', async () => {
    const moved = await seedLegacyRow('results', 'audit', legacyDoc());
    const idle = await seedLegacyRow('results', 'audit-idle', { title_en: 'Nothing here to move' });
    const filed = await auditRows(owner.email);

    expect((await migrate(owner, 'results', [moved])).counts.migrated).toEqual([moved]);
    expect(await auditRows(owner.email)).toBe(filed + 1);

    // A pass over a row with no legacy key changed nothing, so it files no change under the verb.
    const second = await migrate(owner, 'results', [idle]);
    expect(second.counts).toEqual({ migrated: [], skipped: [{ id: idle, reason: 'nothing' }], failed: [] });
    expect(await auditRows(owner.email)).toBe(filed + 1);
  });

  it('refuses to overwrite, and says the row was left as it was', async () => {
    const id = await seedLegacyRow('results', 'kept', bothFilledDoc());
    const before = await stored(key('kept'));

    const reply = await migrate(owner, 'results', [id]);
    expect(reply.status).toBe(200);
    expect(reply.counts).toEqual({ migrated: [], skipped: [{ id, reason: 'kept' }], failed: [] });
    expect(await stored(key('kept'))).toEqual(before);
  });

  it('reports a row it could not write as a failure, never as migrated', async () => {
    // The shared key moves cleanly, and the store then refuses the document for the other key
    // it still holds. The write failed, so the counts have to say so.
    const id = await seedLegacyRow('results', 'refused', legacyDoc({ a_key_no_schema_knows: 'x' }));
    const before = await stored(key('refused'));
    const filed = await auditRows(owner.email);

    const reply = await migrate(owner, 'results', [id]);
    expect(reply.counts.migrated).toEqual([]);
    expect(reply.counts.failed).toEqual([{ id, code: 'invalid_input' }]);
    expect(await stored(key('refused'))).toEqual(before);
    expect(await auditRows(owner.email)).toBe(filed);
  });

  it('counts a page of six the way the person left it', async () => {
    const legacy = await seedLegacyRow('results', 'mix-legacy', legacyDoc());
    const clean = await seedLegacyRow('results', 'mix-clean', { title_en: 'Already split', beforeAlt_en: 'a', afterAlt_en: 'b' });
    const kept = await seedLegacyRow('results', 'mix-kept', bothFilledDoc());
    const inTrash = await seedLegacyRow('results', 'mix-trash', legacyDoc());
    unwrap(await setTrashed('list_item', { id: inTrash, trashed: true, actorId: owner.id }), 'trash mix-trash');
    const foreign = await seedLegacyRow('specialists', 'mix-foreign', legacyDoc());
    const missing = randomUUID();

    const reply = await migrate(owner, 'results', [legacy, clean, kept, inTrash, foreign, missing]);
    expect(reply.counts.migrated).toEqual([legacy]);
    expect(reply.counts.skipped.map((entry) => entry.reason).sort()).toEqual(['in_trash', 'kept', 'nothing']);
    expect(reply.counts.failed.map((entry) => entry.id).sort()).toEqual([foreign, missing].sort());
    // Both read as `out_of_scope`: an id that names no row is not in the list the request named,
    // which is the same answer the sibling bulk verbs give a pasted id. The `not_found` branch
    // below the scope test only covers the race where a row vanishes between the two reads.
    expect(reply.counts.failed.map((entry) => entry.code).sort()).toEqual(['out_of_scope', 'out_of_scope']);
  });

  it('runs twice with nothing to report the second time', async () => {
    const id = await seedLegacyRow('results', 'retry', legacyDoc());
    const before = await stored(key('retry'));
    expect((await migrate(owner, 'results', [id])).counts.migrated).toEqual([id]);
    const once = await stored(key('retry'));

    // A retry after a dropped connection is the same request again, on the row the first wrote.
    expect(await migrate(owner, 'results', [id])).toMatchObject({ status: 200, counts: { migrated: [], skipped: [{ id, reason: 'nothing' }] } });
    expect(await stored(key('retry'))).toEqual(once);
    expect(once.draft).not.toBe(before.draft);
  });
});

describe('the route refuses what the list cannot mean', () => {
  it('refuses a list whose own schema draws the `alt` box, before reading a row', async () => {
    const id = await seedLegacyRow('specialists', 'guard', legacyDoc());
    const before = await stored(key('guard'));

    const reply = await migrate(owner, 'specialists', [id]);
    expect(reply.status).toBe(400);
    expect(reply.error).toBe('alt_migration_not_applicable');
    expect(await stored(key('guard'))).toEqual(before);
  });

  it('asks which list before it asks anything else', async () => {
    const reply = await migrate(owner, null, [randomUUID()]);
    expect(reply.status).toBe(400);
    expect(reply.error).toBe('list_required');
  });

  it('will not take ids pasted in from another list', async () => {
    const foreign = await seedLegacyRow('specialists', 'scope', legacyDoc());
    const reply = await migrate(owner, 'results', [foreign]);
    expect(reply.counts).toEqual({ migrated: [], skipped: [], failed: [{ id: foreign, code: 'out_of_scope' }] });
    expect(JSON.parse((await stored(key('scope'))).draft)).toHaveProperty('alt_ar');
  });

  it('is a write, so a reader is turned away and a GET has no meaning', async () => {
    const id = await seedLegacyRow('results', 'roles', legacyDoc());
    const denied = await migrate(viewer, 'results', [id]);
    expect(denied.status).toBe(403);
    expect(denied.body.action).toBe('list.update');
    expect(JSON.parse((await stored(key('roles'))).draft)).toHaveProperty('alt_ar');

    expect((await migrate(owner, 'results', [id], 'GET')).status).toBe(405);
  });

  it('refuses an empty selection', async () => {
    expect((await migrate(owner, 'results', [])).status).toBe(400);
  });
});
