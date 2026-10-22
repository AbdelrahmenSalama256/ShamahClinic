/**
 * Proves the Kysely types in src/lib/db/types.ts match the columns the migrations
 * actually created — a renamed or dropped column fails here instead of at runtime.
 * Runs against the disposable _test database only.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { assertTestDb } from './guard';
import { db, destroyDb, getDb } from './index';
import { json } from './json';
import { migrationFiles, splitStatements } from './migrate';

interface Parsed {
  parents: string[];
  /** column -> its declared type text, e.g. `Generated<Date>` or `string | null`. */
  cols: Map<string, string>;
}

const isGenerated = (type: string): boolean => /^Generated</.test(type);

/**
 * A type is invisible at runtime, so the only way to test one is to read its
 * source: parse every interface in types.ts, follow `extends`, and return each
 * table's columns with their declared type text. `extends` joins with `and`, not commas.
 */
function declaredColumns(src: string): Map<string, { cols: Set<string>; types: Map<string, string> }> {
  const ifaces = new Map<string, Parsed>();
  let current: Parsed | null = null;
  for (const line of src.split('\n')) {
    const decl = line.match(/^(?:export )?interface (\w+)(?: extends ([^{]*))? \{/);
    if (decl) {
      current = { parents: (decl[2] ?? '').split(/\s+and\s+/).map((p) => p.trim()).filter(Boolean), cols: new Map() };
      ifaces.set(decl[1], current);
      continue;
    }
    if (!current) continue;
    if (line === '}') {
      current = null;
      continue;
    }
    const col = line.match(/^ {2}(\w+): (?:readonly )?(.+);$/);
    if (col) current.cols.set(col[1], col[2]);
  }

  const columnsOf = (name: string, seen = new Set<string>()): Map<string, string> => {
    const iface = ifaces.get(name);
    if (!iface || seen.has(name)) return new Map();
    seen.add(name);
    const out = new Map<string, string>();
    for (const parent of iface.parents) {
      for (const [col, type] of columnsOf(parent, seen)) out.set(col, type);
    }
    for (const [col, type] of iface.cols) out.set(col, type);
    return out;
  };

  const byTable = new Map<string, { cols: Set<string>; types: Map<string, string> }>();
  const database = ifaces.get('Database');
  if (!database) throw new Error('types.ts has no Database interface');
  for (const [table, ifaceName] of database.cols) {
    const types = columnsOf(ifaceName);
    byTable.set(table, { cols: new Set(types.keys()), types });
  }
  return byTable;
}

describe('schema <-> types', () => {
  beforeAll(() => {
    assertTestDb();
  });

  afterAll(async () => {
    await destroyDb();
  });

  it('creates every table the types name', async () => {
    const result = await sql<{ table_name: string }>`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`.execute(
      getDb(),
    );
    const created = new Set(result.rows.map((row) => row.table_name));
    for (const expected of [
      'users',
      'roles',
      'role_permissions',
      'sessions',
      'articles',
      'offers',
      'pages',
      'content_fields',
      'lists',
      'list_items',
      'seo_entries',
      'redirects',
      'ctas',
      'leads',
      'revisions',
      'snapshots',
      'audit_log',
      'stats_events',
    ]) {
      expect(created.has(expected), `table ${expected}`).toBe(true);
    }
  });

  it('round-trips a bilingual user row through the typed API', async () => {
    const id = randomUUID();
    const email = `zed-${id.slice(0, 8)}@example.com`;
    await db
      .insertInto('users')
      .values({
        id,
        email: email.toUpperCase(),
        email_lc: email,
        password_hash: '$2b$12$notahashnotahashnotahashnotahashnotahashnotahashnotah',
        name: 'zed',
        locale: 'ar',
        status: 'active',
      })
      .execute();

    const row = await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.email_lc).toBe(email);
    expect(row.version).toBe(1);
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it('stores and returns a JSON list item exactly as written', async () => {
    const listId = randomUUID();
    const itemId = randomUUID();
    const draft = {
      name: { ar: 'د. نورهان', en: 'Dr. Nourhan' },
      specialties: { ar: ['ليزر', 'حقن'], en: ['laser', 'injectables'] },
      experienceYears: 12,
      enabled: true,
    };
    await db
      .insertInto('lists')
      .values({ id: listId, list_key: `test_specialists_${itemId.slice(0, 8)}`, item_schema: json({}) })
      .execute();
    await db
      .insertInto('list_items')
      .values({ id: itemId, list_id: listId, uid: 'dr-nourhan', position: 1, draft: json(draft), status: 'draft' })
      .execute();

    const row = await db.selectFrom('list_items').select('draft').where('id', '=', itemId).executeTakeFirstOrThrow();
    expect(row.draft).toEqual(draft);
  });

  it('keeps a DECIMAL price exact, because a price is never a float', async () => {
    const id = randomUUID();
    await db
      .insertInto('offers')
      .values({ id, slug: `offer-${id}`, name_ar: 'عرض', name_en: 'Offer', price: '1499.99', regular_price: '2000.00' })
      .execute();
    const row = await db.selectFrom('offers').select(['price', 'regular_price']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(row.price).toBe('1499.99');
    expect(row.regular_price).toBe('2000.00');
  });

  it('writes the audit trail with before_json/after_json, which are not reserved words', async () => {
    await db
      .insertInto('audit_log')
      .values({
        actor_email: 'tester@localhost',
        action: 'test.write',
        before_json: json({ enabled: true }),
        after_json: json({ enabled: false }),
      })
      .execute();
    const row = await db
      .selectFrom('audit_log')
      .select(['action', 'before_json', 'after_json'])
      .where('action', '=', 'test.write')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(row.after_json).toEqual({ enabled: false });
  });

  it('rejects a duplicate slug, so an import cannot silently create two articles on one URL', async () => {
    const slug = `dup-${randomUUID()}`;
    const values = { id: randomUUID(), slug, title_ar: 'أ', title_en: 'a' };
    await db.insertInto('articles').values(values).execute();
    await expect(db.insertInto('articles').values({ ...values, id: randomUUID() }).execute()).rejects.toThrow(/Duplicate entry/);
  });

  it('splits every migration into statements that each end in a complete sentence', () => {
    for (const file of migrationFiles()) {
      for (const statement of splitStatements(file.contents)) {
        expect(statement, file.name).toMatch(/^(CREATE|INSERT)/i);
      }
    }
  });

  it('marks exactly the columns the database defaults as Generated', async () => {
    const columns = await sql<{ table_name: string; column_name: string; column_default: string | null; extra: string }>`
      SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_DEFAULT AS column_default, EXTRA AS extra
      FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`.execute(getDb());

    const dbColumns = new Map<string, Set<string>>();
    const hasDefault = new Map<string, Set<string>>();
    for (const row of columns.rows) {
      const cols = dbColumns.get(row.table_name) ?? new Set<string>();
      cols.add(row.column_name);
      dbColumns.set(row.table_name, cols);
      // MariaDB prints a bare nullable column's missing default as the string 'NULL'.
      const defaulted = (row.column_default !== null && row.column_default !== 'NULL') || /auto_increment|on update/i.test(row.extra);
      if (!defaulted) continue;
      const set = hasDefault.get(row.table_name) ?? new Set<string>();
      set.add(row.column_name);
      hasDefault.set(row.table_name, set);
    }

    const declared = declaredColumns(readFileSync(path.resolve(process.cwd(), 'src/lib/db/types.ts'), 'utf8'));
    const drift: string[] = [];
    for (const [table, cols] of dbColumns) {
      const ts = declared.get(table);
      if (!ts) {
        drift.push(`${table} exists in the database but types.ts has no interface for it`);
        continue;
      }
      for (const col of cols) if (!ts.cols.has(col)) drift.push(`${table}.${col} is in the database but not in types.ts`);
      for (const col of ts.cols) if (!cols.has(col)) drift.push(`${table}.${col} is in types.ts but not in the database`);
    }
    for (const [table, ts] of declared) {
      if (!dbColumns.has(table)) drift.push(`${table}: types.ts names a table the database does not have`);
      const dbDefaults = hasDefault.get(table) ?? new Set<string>();
      for (const col of ts.cols) {
        const generated = isGenerated(ts.types.get(col) ?? '');
        if (generated && !dbDefaults.has(col)) drift.push(`${table}.${col} is Generated in types.ts but has no SQL default`);
        if (!generated && dbDefaults.has(col)) drift.push(`${table}.${col} has a SQL default but types.ts requires it on insert`);
      }
    }
    expect(drift, drift.join('\n')).toEqual([]);
  });
});
