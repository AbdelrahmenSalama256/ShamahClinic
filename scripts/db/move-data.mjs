/**
 * Moving the content from the local MariaDB to the server's MariaDB, without ever
 * writing to the local one.
 *
 *   node scripts/db/move-data.mjs dump --from .env.xampp --out backups/move.json.gz
 *   node scripts/db/move-data.mjs restore --to /home/USER/shamah.env --in backups/move.json.gz
 *   node scripts/db/move-data.mjs restore --to … --in … --apply --confirm-target NAME
 *   node scripts/db/move-data.mjs verify --to … --in backups/move.json.gz
 *
 * The dump is a gzipped JSON file, never committed (`/backups/` is ignored): it holds real
 * leads and password hashes. `dump` opens the source connection READ ONLY and issues only
 * SELECTs. `restore` is a dry run unless `--apply` is given, refuses to run against the
 * database the dump came from, and refuses a target whose tables already hold rows unless
 * `--replace` says those rows may be deleted (the dump is the only copy either way). A write
 * also requires `--confirm-target` to name the target's DATABASE_NAME, so a restore cannot
 * reach a database the command did not mention.
 *
 * The verify step is not "did the rows land": counts and a per-table content hash are
 * compared, and every JSON column is read back and must arrive already parsed, because
 * the application's readers expect an object and call no JSON.parse.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import mysql from 'mysql2/promise';

const FORMAT = 'shamah-move/1';
const MIGRATIONS_TABLE = 'app_migrations';
const BATCH = 200;
/** A value's fingerprint ignores key order but not the shape of the value. */
export function valueFingerprint(values) {
  return createHash('sha256').update(values.map(stableStringify).sort().join('\n')).digest('hex');
}

/**
 * MariaDB stores a JSON column as longtext with a `json_valid()` check, so the column list
 * is read from those checks rather than guessed from column names — 22 columns in this
 * schema, and a new one must be covered the day its migration lands.
 */
export function jsonColumnsFromChecks(rows) {
  return rows
    .map((row) => {
      const match = /json_valid\(`([^`]+)`\)/i.exec(row.clause ?? '');
      return match ? { table: row.table, column: match[1] } : null;
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Small helpers (exported for the test)
// ---------------------------------------------------------------------------

export function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(resolve(path), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

/** Key order in a JSON document is not stable across servers; the hash must not care. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Buffer.isBuffer(value)) return JSON.stringify({ __buffer: value.toString('base64') });
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function rowHash(row) {
  return createHash('sha256').update(stableStringify(row)).digest('hex');
}

export function tableHash(rows) {
  const hashes = rows.map(rowHash).sort();
  return createHash('sha256').update(hashes.join('\n')).digest('hex');
}

/** What the driver hands back for an object-shaped column, ready for an INSERT placeholder. */
export function toSqlValue(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * A JSON column needs the document written as a document. A JSON *string* scalar is the
 * trap: read back it is the JS string `20555000111`, and inserting that unquoted stores a
 * JSON number, which the next reader sees as "no value saved here".
 */
export function toJsonSqlValue(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value;
  return JSON.stringify(value);
}

function connectionConfig(env) {
  return {
    host: (env.DATABASE_HOST ?? '').trim(),
    port: Number(env.DATABASE_PORT ?? 3306),
    user: (env.DATABASE_USER ?? '').trim(),
    password: env.DATABASE_PASSWORD ?? '',
    database: (env.DATABASE_NAME ?? '').trim(),
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
}

function describe(env) {
  return `${(env.DATABASE_USER ?? '').trim()}@${(env.DATABASE_HOST ?? '').trim()}:${env.DATABASE_PORT ?? 3306}/${(env.DATABASE_NAME ?? '').trim()}`;
}

function requireConfig(env) {
  const config = connectionConfig(env);
  if (!config.host || !config.user || !config.database) {
    throw new Error('Set DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD (or pass --from/--to).');
  }
  return config;
}

async function listTables(connection) {
  const [rows] = await connection.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((row) => row.name);
}

async function listColumns(connection, table) {
  const [rows] = await connection.query(
    'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
    [table],
  );
  return rows.map((row) => row.name);
}

async function countRows(connection, table) {
  const [[row]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(row.n);
}

// ---------------------------------------------------------------------------
// dump
// ---------------------------------------------------------------------------

async function dump(sourceEnv, outPath) {
  const config = requireConfig(sourceEnv);
  const connection = await mysql.createConnection(config);
  try {
    // A read-only session is the guarantee, not the absence of write calls in this file.
    await connection.query('SET SESSION TRANSACTION READ ONLY');
    await connection.query('START TRANSACTION READ ONLY');

    const [[version]] = await connection.query('SELECT VERSION() AS version, @@version_comment AS comment');
    const tables = await listTables(connection);
    const dump = {
      format: FORMAT,
      createdAt: new Date().toISOString(),
      source: {
        host: config.host,
        database: config.database,
        server: `${version.comment} ${version.version}`,
      },
      migrations: [],
      jsonColumns: [],
      tables: {},
    };

    if (tables.includes(MIGRATIONS_TABLE)) {
      const [rows] = await connection.query(`SELECT name, checksum FROM \`${MIGRATIONS_TABLE}\` ORDER BY name`);
      dump.migrations = rows;
    }

    const [checks] = await connection.query(
      "SELECT table_name AS `table`, check_clause AS `clause` FROM information_schema.check_constraints WHERE constraint_schema = DATABASE() AND check_clause LIKE '%json_valid%'",
    );
    dump.jsonColumns = jsonColumnsFromChecks(checks);

    for (const table of tables) {
      if (table === MIGRATIONS_TABLE) continue;
      const columns = await listColumns(connection, table);
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      dump.tables[table] = { columns, rows };
      console.log(`  ${table}: ${rows.length} rows`);
    }

    await connection.query('COMMIT');
    const text = JSON.stringify(dump);
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    await pipeline(Readable.from([text]), createGzip(), createWriteStream(outPath));
    const bytes = statSync(outPath).size;
    console.log(`\nDumped ${Object.keys(dump.tables).length} tables from ${describe(sourceEnv)} (${dump.source.server}).`);
    console.log(`Wrote ${resolve(outPath)} (${(bytes / 1024 / 1024).toFixed(1)} MB, gzipped). Keep it private: it holds leads and password hashes.`);
    console.log(`Source was opened read only; nothing on it changed.`);
    return dump;
  } finally {
    await connection.end();
  }
}

// ---------------------------------------------------------------------------
// restore + verify
// ---------------------------------------------------------------------------

async function readDump(path) {
  if (!existsSync(path)) throw new Error(`No dump at ${resolve(path)}. Run the dump step first.`);
  const chunks = [];
  const gunzip = createGunzip();
  const source = createReadStream(path).pipe(gunzip);
  for await (const chunk of source) chunks.push(chunk);
  const dump = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (dump.format !== FORMAT) throw new Error(`Unrecognised dump format: ${dump.format}`);
  return dump;
}

/**
 * A write needs the target named in the command as well as in the env file. Two files that
 * look alike is how a restore reaches the wrong database; spelling the name makes the
 * operator read it, and a typo is refused before a connection is opened.
 */
export function assertConfirmedTarget(target, args) {
  if (args.confirmTarget && args.confirmTarget !== target.database) {
    throw new Error(
      `--confirm-target is "${args.confirmTarget}" but the target env file names "${target.database}". Refusing to write to a database the command did not name.`,
    );
  }
  if (args.apply && !args.confirmTarget) {
    throw new Error(`restore --apply requires --confirm-target ${target.database} (the target's DATABASE_NAME).`);
  }
}

async function restore(dump, targetEnv, args) {
  const config = requireConfig(targetEnv);
  assertConfirmedTarget(config, args);
  const connection = await mysql.createConnection(config);
  try {
    if (dump.source.host === config.host && dump.source.database === config.database) {
      throw new Error('The target is the database the dump came from. Restoring into it would delete rows on the source.');
    }

    const [[version]] = await connection.query('SELECT VERSION() AS version, @@version_comment AS comment');
    console.log(`Target: ${describe(targetEnv)} (${version.comment} ${version.version})`);

    const targetTables = await listTables(connection);
    const missing = Object.keys(dump.tables).filter((table) => !targetTables.includes(table));
    if (missing.length) {
      throw new Error(`Target is missing ${missing.length} table(s): ${missing.join(', ')}. Run scripts/db/server-setup.mjs --apply first.`);
    }

    // The migrations already applied on the target must be exactly the ones in the dump.
    const [appliedRows] = await connection.query(`SELECT name, checksum FROM \`${MIGRATIONS_TABLE}\``);
    const applied = new Map(appliedRows.map((row) => [row.name, row.checksum]));
    for (const migration of dump.migrations) {
      const targetChecksum = applied.get(migration.name);
      if (!targetChecksum) {
        throw new Error(`Target has not run ${migration.name}. Run scripts/db/server-setup.mjs --apply first.`);
      }
      if (targetChecksum !== migration.checksum) {
        throw new Error(`Migration ${migration.name} differs between source and target. Refusing to copy data onto a different schema.`);
      }
    }

    const nonEmpty = [];
    for (const table of Object.keys(dump.tables)) {
      const count = await countRows(connection, table);
      if (count > 0) nonEmpty.push(`${table} (${count})`);
    }
    if (nonEmpty.length && !args.replace) {
      throw new Error(
        `Target already holds rows in: ${nonEmpty.join(', ')}. Re-run with --replace to delete those rows first. ` +
          '(A freshly migrated database is not empty: some migrations seed a row, e.g. stats_rollup_state.)',
      );
    }
    if (nonEmpty.length) {
      console.log(`Rows that would be deleted in the target only: ${nonEmpty.join(', ')}.`);
    }

    const totalRows = Object.values(dump.tables).reduce((sum, table) => sum + table.rows.length, 0);
    console.log(`${Object.keys(dump.tables).length} tables, ${totalRows} rows to write.`);

    if (!args.apply) {
      console.log('Dry run: nothing was written. Re-run with --apply to execute.');
      return false;
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      await connection.beginTransaction();
      if (args.replace) {
        for (const table of Object.keys(dump.tables).reverse()) {
          await connection.query(`DELETE FROM \`${table}\``);
        }
      }
      for (const [table, data] of Object.entries(dump.tables)) {
        if (!data.rows.length) continue;
        const targetColumns = await listColumns(connection, table);
        const columns = data.columns.filter((column) => targetColumns.includes(column));
        const ignored = data.columns.filter((column) => !targetColumns.includes(column));
        if (ignored.length) console.log(`  ${table}: target has no column(s) ${ignored.join(', ')}; they were not copied.`);
        const placeholders = `(${columns.map(() => '?').join(', ')})`;
        const jsonColumns = new Set(
          (dump.jsonColumns ?? []).filter((entry) => entry.table === table).map((entry) => entry.column),
        );
        for (let offset = 0; offset < data.rows.length; offset += BATCH) {
          const batch = data.rows.slice(offset, offset + BATCH);
          const values = batch.flatMap((row) =>
            columns.map((column) => (jsonColumns.has(column) ? toJsonSqlValue(row[column]) : toSqlValue(row[column]))),
          );
          const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES ${batch.map(() => placeholders).join(', ')}`;
          await connection.query(sql, values);
        }
        console.log(`  ${table}: ${data.rows.length} rows written`);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    return true;
  } finally {
    await connection.end();
  }
}

/**
 * Counts, a content hash per table, and the JSON read-back assertion. Returns the list of
 * failures; an empty list is the only success.
 */
async function verify(dump, targetEnv) {
  const config = requireConfig(targetEnv);
  const connection = await mysql.createConnection(config);
  const failures = [];
  try {
    const [[version]] = await connection.query('SELECT VERSION() AS version, @@version_comment AS comment');
    console.log(`Verified against: ${describe(targetEnv)} (${version.comment} ${version.version})`);
    console.log('');
    console.log('table                          dumped  in target  content hash');

    for (const [table, data] of Object.entries(dump.tables)) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      const targetCount = rows.length;
      const targetHash = tableHash(rows);
      const sourceHash = tableHash(data.rows);
      const countOk = targetCount === data.rows.length;
      const hashOk = targetHash === sourceHash;
      if (!countOk) failures.push(`${table}: ${data.rows.length} dumped, ${targetCount} in target`);
      if (!hashOk) failures.push(`${table}: content differs (${sourceHash.slice(0, 12)} vs ${targetHash.slice(0, 12)})`);
      console.log(
        `${table.padEnd(30)} ${String(data.rows.length).padStart(6)} ${String(targetCount).padStart(10)}  ${hashOk ? 'match' : 'DIFFERENT'}`,
      );
    }

    console.log('');
    console.log('JSON columns (the app never calls JSON.parse; these must arrive already decoded):');
    let textValues = 0;
    for (const { table, column } of dump.jsonColumns ?? []) {
      if (!dump.tables[table]) continue;
      const [rows] = await connection.query(`SELECT \`${column}\` AS v FROM \`${table}\``);
      const targetValues = rows.map((row) => row.v).filter((value) => value !== null);
      const sourceValues = dump.tables[table].rows.map((row) => row[column]).filter((value) => value !== null);
      const looksLikeText = targetValues.filter((value) => typeof value === 'string' && /^\s*[[{]/.test(value));
      const shape = targetValues.find((value) => typeof value === 'object');
      const size = sourceValues.length;
      const fingerprintOk = valueFingerprint(sourceValues) === valueFingerprint(targetValues);
      if (looksLikeText.length) {
        textValues += looksLikeText.length;
        failures.push(
          `${table}.${column}: ${looksLikeText.length} value(s) came back as JSON text, so a reader would need JSON.parse`,
        );
      }
      if (size !== targetValues.length) {
        failures.push(`${table}.${column}: ${size} value(s) in the dump, ${targetValues.length} in the target`);
      }
      if (size > 0 && !fingerprintOk) failures.push(`${table}.${column}: parsed values differ from the dump`);
      console.log(
        `  ${table}.${column.padEnd(14)} ${String(size).padStart(5)} value(s)  ${size === 0 ? '—' : fingerprintOk ? 'same' : 'DIFFERENT'}  ${looksLikeText.length ? `${looksLikeText.length} as TEXT` : shape ? (Array.isArray(shape) ? 'arrays' : 'objects') : 'scalars'}`,
      );
    }
    console.log(
      `  ${(dump.jsonColumns ?? []).length} JSON column(s) from the schema's json_valid checks; ${textValues} value(s) arrived as text.`,
    );

    if (dump.migrations.length) {
      const [applied] = await connection.query(`SELECT name FROM \`${MIGRATIONS_TABLE}\``);
      const names = new Set(applied.map((row) => row.name));
      const absent = dump.migrations.filter((migration) => !names.has(migration.name)).map((migration) => migration.name);
      if (absent.length) failures.push(`${MIGRATIONS_TABLE}: target is missing ${absent.join(', ')}`);
      console.log(`  ${MIGRATIONS_TABLE}: ${dump.migrations.length} in dump, ${names.size} on target`);
    }

    return failures;
  } finally {
    await connection.end();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { mode: argv[0], apply: false, replace: false, from: null, to: null, in: null, out: null, confirmTarget: null };
  if (!['dump', 'restore', 'verify'].includes(args.mode)) {
    throw new Error('Usage: move-data.mjs <dump|restore|verify> [--from .env] [--to .env] [--in dump.gz] [--out dump.gz] [--apply] [--replace] [--confirm-target NAME]');
  }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--replace') args.replace = true;
    else if (arg === '--confirm-target') args.confirmTarget = argv[++i];
    else if (arg === '--from') args.from = argv[++i];
    else if (arg === '--to') args.to = argv[++i];
    else if (arg === '--in') args.in = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceEnv = { ...process.env, ...(args.from ? readEnvFile(args.from) : {}) };
  const targetEnv = { ...process.env, ...(args.to ? readEnvFile(args.to) : {}) };
  const dumpPath = resolve(args.out ?? args.in ?? `backups/move-${stamp()}.json.gz`);

  if (args.mode === 'dump') {
    console.log(`Source: ${describe(sourceEnv)}${args.from ? ` (from ${resolve(args.from)})` : ''}`);
    await dump(sourceEnv, dumpPath);
    return;
  }

  const loaded = await readDump(dumpPath);
  console.log(`Dump: ${dumpPath} (${loaded.source.server}, ${loaded.createdAt})`);

  if (args.mode === 'restore') {
    const wrote = await restore(loaded, targetEnv, args);
    if (!wrote) return;
    console.log('\nRestored. Verifying…\n');
    const failures = await verify(loaded, targetEnv);
    report(failures);
    return;
  }

  report(await verify(loaded, targetEnv));
}

function report(failures) {
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nAll checks passed: same row counts, same content, JSON columns arrive parsed.');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
