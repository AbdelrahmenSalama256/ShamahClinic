/**
 * The order a list is shown in, and the one move a person makes inside it.
 *
 * `position` used to be a number box in the editor. To put a service second, a person had to
 * read the numbers of every other service, guess a free one, and hope no two rows ended up
 * claiming it — and a clash is not a cosmetic problem: the read path orders by the column and
 * then by whichever tie MariaDB picked, so two rows sharing a number can change place between
 * two page loads. The box is gone. This file is now the only thing that writes those columns,
 * in the two moments a number is actually decided: a row joining a list, and a row moving.
 *
 * A move writes the whole scope `1..n` in the order the list was just read, so a list cannot
 * hold two 3s after one — including the lists the WordPress import left every row of at `0`.
 * A new row takes one past the end, so it joins at the back instead of sharing `0` with
 * every imported row and arriving in front of them.
 *
 * The order computed here is the order the site renders and the console list prints: the
 * position column, then the identity column. A row drawn above another is the row a move
 * swaps with, which is the whole claim the buttons make.
 */
import { sql } from 'kysely';
import { db } from '../db';
import { kindSpec, type ContentKind } from './kinds';

export type MoveDirection = 'up' | 'down';

interface OrderedRow {
  id: string;
  position: number;
}

interface Scope {
  table: 'offers' | 'list_items';
  keyColumn: string;
  /** the `lists.id` every row of a list-item scope shares; null for the offers table */
  listId: string | null;
}

export interface MoveResult {
  /** the ids of the scope in their new order */
  ids: string[];
  /** how many rows this move rewrote — usually two, and every row the first time a legacy list is touched */
  written: number;
}

type StoreError = { ok: false; status: number; code: string };

function failed(status: number, code: string): StoreError {
  return { ok: false, status, code };
}

/**
 * The rows that move together, in the order both the site and the list read them.
 *
 * Trashed rows are left out and keep their old number: a row in the Trash is not in the order
 * a person is editing, and pulling it back should put it where they left it rather than at the
 * end of a reshuffled list.
 */
async function orderedRows(kind: ContentKind, listKey: string | null): Promise<{ scope: Scope; rows: OrderedRow[] } | null> {
  const spec = kindSpec(kind);
  // An article is ordered by its date and a page by its route: neither has a position column
  // an owner moves, so this file refuses to touch either.
  const table = spec.table === 'list_items' || spec.table === 'offers' ? spec.table : null;
  if (!table) return null;
  let listId: string | null = null;
  if (table === 'list_items') {
    if (!listKey) return null;
    const list = await db.selectFrom('lists').select(['id']).where('list_key', '=', listKey).executeTakeFirst();
    if (!list) return null;
    listId = list.id;
  }
  let query = db.selectFrom(table).select(['id', 'position']) as unknown as Shape;
  if (listId) query = query.where('list_id', '=', listId);
  const raw = await query
    .where('deleted_at', 'is', null)
    .orderBy('position', 'asc')
    .orderBy(spec.keyColumn, 'asc')
    .execute();
  return { scope: { table, keyColumn: spec.keyColumn, listId }, rows: raw.map((row) => ({ id: String(row.id), position: Number(row.position) })) };
}

/** Renumber `1..n` and write only the rows whose number actually changed. */
async function writeOrder(scope: Scope, ids: string[], current: Map<string, number>, actorId: string): Promise<number> {
  let written = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index]!;
    const wanted = index + 1;
    if (current.get(id) === wanted) continue;
    // `updated_at = updated_at` keeps the timestamp the column would otherwise take for itself:
    // reordering one row renumbers its neighbours, and a list whose "Updated" column jumped for
    // rows nobody touched reads as though a colleague had been editing them.
    await db
      .updateTable(scope.table)
      .set({ position: wanted, updated_by: actorId, updated_at: sql`updated_at` } as never)
      .where('id', '=', id)
      .execute();
    written += 1;
  }
  return written;
}

/**
 * Move one row one step, and renumber its list.
 *
 * The swap is computed against the database's own order rather than the page the browser is
 * showing, so a row at the bottom of page one moves into page two the way the person pressed.
 */
export async function moveRow(
  kind: ContentKind,
  input: { id: string; direction: MoveDirection; listKey: string | null; actorId: string },
): Promise<{ ok: true; value: MoveResult } | StoreError> {
  const found = await orderedRows(kind, input.listKey);
  if (!found) return failed(404, 'not_found');
  const { scope, rows } = found;
  const at = rows.findIndex((row) => row.id === input.id);
  if (at === -1) return failed(404, 'not_found');
  const to = input.direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= rows.length) return failed(409, 'nothing_to_move');

  const ids = rows.map((row) => row.id);
  const [moved] = ids.splice(at, 1);
  ids.splice(to, 0, moved!);
  const current = new Map(rows.map((row) => [row.id, row.position]));
  const written = await writeOrder(scope, ids, current, input.actorId);
  return { ok: true, value: { ids, written } };
}

/** Where a new row joins the order: one past the end, never the default 0 that outranked the list. */
export async function positionForNewItem(kind: ContentKind, listKey: string | null): Promise<number> {
  const found = await orderedRows(kind, listKey);
  if (!found) return 1;
  let highest = 0;
  for (const row of found.rows) if (row.position > highest) highest = row.position;
  return highest + 1;
}

interface Shape {
  where(column: string, operator: string, value: unknown): Shape;
  orderBy(column: string, direction?: 'asc' | 'desc'): Shape;
  execute(): Promise<{ id: unknown; position: unknown }[]>;
}
