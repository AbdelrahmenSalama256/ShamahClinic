/**
 * npm run db:repair-plain                    -> list the text columns that hold markup (default, writes nothing)
 * npm run db:repair-plain -- --apply         -> rewrite them
 * npm run db:repair-plain -- --force-database --apply
 *                                            -> also allowed against a database not named *_test
 *
 * The WordPress import wrote every column verbatim, so a plain field — a title, an
 * excerpt, an `alt` — still holds the `<p>` and the `&#8217;` that used to wrap its
 * sentence. The site and the console already print the sentence, because both read
 * paths clean through `readStored()`; this pass makes the **column** say the same thing,
 * so a dump, a restore or a new renderer cannot hand the markup back to a person.
 *
 * Only `plain` columns are touched, and they are taken from `KIND_SPECS` rather than
 * typed out, so a field that changes format changes what this repairs. An `html` body
 * keeps its tags by design and a `page` body is a `source` document `hero.ts` still reads
 * `rs-slide` and `data-thumb` out of — running the allowlist over either would delete
 * the homepage hero and any embed a story carries.
 *
 * Nothing is republished: no `version` moves and no `revisions` row is written, because
 * the words a reader sees do not change. Every value this is about to overwrite is
 * written to `backups/` as an undo journal first, and the same text is still in the
 * row's import `revisions` snapshot, so a restore is a lookup rather than a loss.
 *
 * Re-running is a no-op: `plainText()` settles, so a repaired column reads back as
 * itself and drops out of the next pass.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTestDb } from '../../src/lib/db/guard';
import { db, destroyDb, readDbConfig } from '../../src/lib/db/index';
import { plainText } from '../../src/lib/content/format';
import { KIND_SPECS, type KindSpec } from '../../src/lib/content/kinds';

interface QueryShape {
  select(column: string): QueryShape;
  execute(): Promise<Record<string, unknown>[]>;
}

interface UpdateShape {
  set(values: Record<string, string>): UpdateShape;
  where(column: string, op: string, value: unknown): UpdateShape;
  execute(): Promise<unknown>;
}

interface Edit {
  table: string;
  id: string;
  column: string;
  was: string;
  now: string;
}

/** Every plain column of one kind, draft and published twin alike, id excepted. */
function plainColumns(spec: KindSpec): string[] {
  const columns: string[] = [];
  for (const field of spec.bi) {
    if (field.format !== 'plain') continue;
    columns.push(field.draft.ar, field.draft.en);
    if (field.pub) columns.push(field.pub.ar, field.pub.en);
  }
  for (const field of spec.text) {
    if (field.format === 'plain') columns.push(field.column);
  }
  return columns;
}

function show(value: string): string {
  const one = value.replace(/\s+/g, ' ').trim();
  return one.length > 72 ? `${one.slice(0, 72)}…` : one;
}

/** The column's value as MariaDB holds it, or null when the row says nothing there. */
function stored(row: Record<string, unknown>, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text === '' ? null : text;
}

async function collect(spec: KindSpec, edits: Edit[]): Promise<{ rows: number; scanned: number }> {
  const columns = plainColumns(spec);
  let query = db.selectFrom(spec.table as never) as unknown as QueryShape;
  query = query.select('id');
  for (const column of columns) query = query.select(column);
  const found = await query.execute();

  let changed = 0;
  for (const row of found) {
    let thisRow = 0;
    for (const column of columns) {
      const was = stored(row, column);
      if (was === null) continue;
      const now = plainText(was);
      if (now === was) continue;
      edits.push({ table: spec.table, id: String(row.id), column, was, now });
      thisRow += 1;
    }
    if (thisRow > 0) changed += 1;
  }
  console.log(`  ${spec.kind}: ${columns.length} plain column(s), ${found.length} row(s), ${changed} carrying markup`);
  return { rows: changed, scanned: found.length };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const forced = process.argv.includes('--force-database');
  const database = forced ? readDbConfig().database : assertTestDb();

  console.log(`plain-text repair — database ${database}`);

  const edits: Edit[] = [];
  for (const spec of KIND_SPECS) await collect(spec, edits);

  console.log();
  for (const edit of edits.slice(0, 12)) console.log(`  ${edit.table}.${edit.id.slice(0, 8)} ${edit.column}\n    was ${show(edit.was)}\n    now ${show(edit.now) || '(empty)'}`);
  if (edits.length > 12) console.log(`  … ${edits.length - 12} more`);

  if (edits.length === 0) {
    console.log('Nothing to repair: every plain column already holds its sentence.');
    return;
  }
  const rows = new Set(edits.map((edit) => `${edit.table}:${edit.id}`)).size;
  if (!apply) {
    console.log(`DRY RUN — ${edits.length} column value(s) on ${rows} row(s) would be rewritten. Re-run with --apply.`);
    return;
  }

  // The journal goes down before the first UPDATE, so a crash mid-pass is still undoable.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(process.cwd(), 'backups', `${database}-plain-repair-${stamp}.json`);
  mkdirSync(join(process.cwd(), 'backups'), { recursive: true });
  writeFileSync(file, JSON.stringify({ database, at: new Date().toISOString(), edits }, null, 2));
  console.log(`undo journal: ${file.replace(process.cwd(), '.')} (${edits.length} value(s))`);

  const byRow = new Map<string, { table: string; id: string; patch: Record<string, string> }>();
  for (const edit of edits) {
    const entry = byRow.get(`${edit.table}:${edit.id}`) ?? { table: edit.table, id: edit.id, patch: {} };
    entry.patch[edit.column] = edit.now;
    byRow.set(`${edit.table}:${edit.id}`, entry);
  }
  for (const entry of byRow.values()) {
    const update = db.updateTable(entry.table as never) as unknown as UpdateShape;
    await update.set(entry.patch).where('id', '=', entry.id).execute();
  }
  console.log(`Repaired ${edits.length} column value(s) on ${byRow.size} row(s). No version moved and no revision was written.`);
}

main()
  .then(async () => {
    await destroyDb();
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await destroyDb();
    process.exitCode = 1;
  });
