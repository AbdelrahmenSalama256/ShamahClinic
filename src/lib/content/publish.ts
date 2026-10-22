/**
 * Publishing: the draft an editor wrote becomes the copy the site serves, or it
 * does not happen at all.
 *
 * One transaction copies every named locale's `draft → pub_*` pair, moves the row's
 * status and `published_at`, and inserts a `revisions` row holding the whole
 * after-image. A rollback reads a revision and rewrites the published columns from
 * it; the revision itself is never touched and nothing is ever deleted, so the
 * history of an article outlives every edit to it.
 *
 * Which locales may be published is decided by the caller (./api.ts checks the
 * grants per locale), so a single-language editor cannot publish the language they
 * cannot write.
 */
import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import { db } from '../db';
import { json } from '../db/json';
import type { Database } from '../db/types';
import { CONTENT_LOCALES, kindSpec, publishableColumns, type ContentKind, type ContentLocale, type KindSpec } from './kinds';
import { getRow, type ContentRow, type StoreResult } from './store';

export interface RevisionView {
  id: string;
  revision: number;
  authorEmail: string;
  note: string;
  createdAt: string;
  snapshot: Record<string, unknown>;
}

export interface PublishOutcome {
  row: ContentRow;
  revision: number;
  /** the locales whose published copy this publish rewrote */
  locales: ContentLocale[];
}

interface Actor {
  id: string;
  email: string;
}

/** Another editor wrote the same row first; the transaction is rolled back and the caller gets a 409. */
class StaleRowError extends Error {
  constructor(version: number) {
    super(`the row had already moved past version ${version}`);
  }
}

function toRevisionView(row: {
  id: string;
  revision: number;
  author_email: string;
  note: string;
  created_at: Date;
  snapshot: unknown;
}): RevisionView {
  const snapshot = typeof row.snapshot === 'string' ? (JSON.parse(row.snapshot) as Record<string, unknown>) : (row.snapshot as Record<string, unknown>);
  return { id: row.id, revision: row.revision, authorEmail: row.author_email, note: row.note, createdAt: row.created_at.toISOString(), snapshot };
}

/** The columns a publish copies for one locale: the text pairs, plus JSON pairs that have a twin. */
function pairsFor(spec: KindSpec, locale: ContentLocale): { from: string; to: string }[] {
  const pairs = publishableColumns(spec, locale).map((column) => ({ from: column.draft, to: column.pub }));
  for (const field of spec.json) {
    if (field.pub) pairs.push({ from: field.draft, to: field.pub });
  }
  return pairs;
}

/** Every published column of a kind, both locales, de-duplicated. */
function publishedColumns(spec: KindSpec): string[] {
  const seen = new Set<string>();
  for (const locale of CONTENT_LOCALES) for (const pair of pairsFor(spec, locale)) seen.add(pair.to);
  return [...seen];
}

/**
 * One column value as it goes into an UPDATE.
 *
 * `mysql2` reads a JSON column back already parsed and serialises a JS object on
 * the way in as `key = 'value', …` SQL text, which the column's `json_valid()`
 * check rejects. So a copied value that is not a string is re-encoded — the same
 * rule `./store.ts` follows when it writes a draft.
 */
function columnValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : json(value);
}

async function readRaw(trx: Transaction<Database>, kind: ContentKind, id: string): Promise<Record<string, unknown> | null> {
  const spec = kindSpec(kind);
  const row = await (trx.selectFrom(spec.table).selectAll().where('id', '=', id) as unknown as TakeRowShape).executeTakeFirst();
  return (row as Record<string, unknown> | undefined) ?? null;
}

async function writeRaw(
  trx: Transaction<Database>,
  kind: ContentKind,
  input: { id: string; patch: Record<string, unknown>; lock: number },
): Promise<boolean> {
  const spec = kindSpec(kind);
  const result = await (
    trx.updateTable(spec.table).set(input.patch as never).where('id', '=', input.id).where('version', '=', input.lock) as unknown as TakeFirstShape
  ).executeTakeFirst();
  return Number(result?.numUpdatedRows ?? 0) > 0;
}

async function addRevision(
  trx: Transaction<Database>,
  input: { kind: ContentKind; id: string; actor: Actor; note: string; snapshot: Record<string, unknown> },
): Promise<number> {
  const latest = await trx
    .selectFrom('revisions')
    .select('revision')
    .where('entity_type', '=', input.kind)
    .where('entity_id', '=', input.id)
    .orderBy('revision', 'desc')
    .limit(1)
    .executeTakeFirst();
  const revision = (latest?.revision ?? 0) + 1;

  await trx
    .insertInto('revisions')
    .values({
      id: randomUUID(),
      entity_type: input.kind,
      entity_id: input.id,
      revision,
      snapshot: JSON.stringify(input.snapshot),
      author_id: input.actor.id,
      author_email: input.actor.email,
      note: input.note,
      created_at: new Date(),
    })
    .execute();
  return revision;
}

/**
 * Copy the draft into the published columns and record it.
 *
 * A publish with nothing pending still writes a revision: an editor who pressed
 * publish expects the history to show that they did.
 *
 * `at` is for the WordPress import, which names the article's original date so the
 * journal keeps its order; the console's own request shape has no such field, so an
 * editor's publish is always stamped with the moment they pressed it.
 */
export async function publishRow(
  kind: ContentKind,
  input: { id: string; locales: ContentLocale[]; actor: Actor; note?: string; at?: Date },
): Promise<StoreResult<PublishOutcome>> {
  const spec = kindSpec(kind);
  const current = await getRow(kind, input.id);
  if (!current) return { ok: false, status: 404, code: 'not_found' };
  if (current.trashed) return { ok: false, status: 409, code: 'in_trash' };

  const named = CONTENT_LOCALES.filter((locale) => input.locales.includes(locale));
  if (spec.perLocale && named.length === 0) return { ok: false, status: 400, code: 'no_locales' };
  const locales = spec.perLocale ? named : [...CONTENT_LOCALES];

  let revision = 0;
  try {
    await db.transaction().execute(async (trx) => {
      const raw = await readRaw(trx, kind, input.id);
      if (!raw) throw new Error(`row ${input.id} disappeared`);

      const patch: Record<string, unknown> = {
        updated_by: input.actor.id,
        published_at: input.at ?? new Date(),
        status: 'published',
        version: current.version + 1,
      };
      const copied = new Set<string>();
      for (const locale of locales) {
        for (const pair of pairsFor(spec, locale)) {
          if (copied.has(pair.to)) continue;
          copied.add(pair.to);
          patch[pair.to] = columnValue(raw[pair.from]);
        }
      }

      if (!(await writeRaw(trx, kind, { id: input.id, patch, lock: current.version }))) throw new StaleRowError(current.version);
      revision = await addRevision(trx, {
        kind,
        id: input.id,
        actor: input.actor,
        note: input.note ?? `publish ${locales.join('+')}`,
        snapshot: { ...raw, ...patch },
      });
    });
  } catch (error) {
    if (error instanceof StaleRowError) return { ok: false, status: 409, code: 'stale_row' };
    throw error;
  }

  const row = await getRow(kind, input.id);
  if (!row) return { ok: false, status: 500, code: 'publish_failed' };
  return { ok: true, value: { row, revision, locales } };
}

export async function listRevisions(kind: ContentKind, id: string, limit = 20): Promise<RevisionView[]> {
  const rows = await db
    .selectFrom('revisions')
    .selectAll()
    .where('entity_type', '=', kind)
    .where('entity_id', '=', id)
    .orderBy('revision', 'desc')
    .limit(limit)
    .execute();
  return rows.map(toRevisionView);
}

/**
 * Put a revision's published columns back on the row, as a new revision.
 *
 * Only the published twins move: a rollback never overwrites the draft somebody is
 * currently writing.
 */
export async function rollbackToRevision(
  kind: ContentKind,
  input: { id: string; revision: number; actor: Actor },
): Promise<StoreResult<{ row: ContentRow; revision: number }>> {
  const spec = kindSpec(kind);
  const current = await getRow(kind, input.id);
  if (!current) return { ok: false, status: 404, code: 'not_found' };

  const chosen = await db
    .selectFrom('revisions')
    .selectAll()
    .where('entity_type', '=', kind)
    .where('entity_id', '=', input.id)
    .where('revision', '=', input.revision)
    .executeTakeFirst();
  if (!chosen) return { ok: false, status: 404, code: 'revision_not_found' };

  const snapshot = (typeof chosen.snapshot === 'string' ? (JSON.parse(chosen.snapshot) as Record<string, unknown>) : chosen.snapshot) as Record<string, unknown>;
  const restore: Record<string, unknown> = {};
  for (const column of publishedColumns(spec)) {
    if (column in snapshot) restore[column] = columnValue(snapshot[column]);
  }
  if (Object.keys(restore).length === 0) return { ok: false, status: 409, code: 'revision_has_no_published_copy' };

  let revision = 0;
  try {
    await db.transaction().execute(async (trx) => {
      const raw = await readRaw(trx, kind, input.id);
      if (!raw) throw new Error(`row ${input.id} disappeared`);

      const patch = { ...restore, updated_by: input.actor.id, version: current.version + 1 };
      if (!(await writeRaw(trx, kind, { id: input.id, patch, lock: current.version }))) throw new StaleRowError(current.version);

      revision = await addRevision(trx, {
        kind,
        id: input.id,
        actor: input.actor,
        note: `rollback to revision ${input.revision}`,
        snapshot: { ...raw, ...patch },
      });
    });
  } catch (error) {
    if (error instanceof StaleRowError) return { ok: false, status: 409, code: 'stale_row' };
    throw error;
  }

  const row = await getRow(kind, input.id);
  if (!row) return { ok: false, status: 500, code: 'rollback_failed' };
  return { ok: true, value: { row, revision } };
}

interface TakeRowShape {
  executeTakeFirst(): Promise<Record<string, unknown> | undefined>;
}
interface TakeFirstShape {
  executeTakeFirst(): Promise<{ numUpdatedRows?: bigint | number } | undefined>;
}
