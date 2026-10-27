/**
 * One script for an empty database on a server: create it (optionally), then apply every
 * migration in order. Safe to run twice — a second run says "nothing to do".
 *
 *   node scripts/db/server-setup.mjs --env-file /home/USER/shamah.env
 *       Read-only by default: prints the server version, the tables that exist, and the
 *       migrations that would run. Changes nothing.
 *
 *   node scripts/db/server-setup.mjs --env-file … --apply
 *       Applies the pending migrations with the app's own credentials.
 *
 *   node scripts/db/server-setup.mjs --env-file … --create --apply
 *       Also creates the database and the one-database user. Needs an admin login
 *       (SERVER_ADMIN_USER / SERVER_ADMIN_PASSWORD) and a loopback host, because this
 *       path mints credentials with the password from the environment.
 *
 * Why plain JavaScript and not the TypeScript runner: the server artifact has no tsx and
 * no dev dependencies. This file and `src/lib/db/migrate.ts` must agree, and
 * `tests/server-setup.test.ts` holds them to it (same file list, same checksums, same
 * statements).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

// ---------------------------------------------------------------------------
// Pure helpers (exported so the test can compare them with the TypeScript runner)
// ---------------------------------------------------------------------------

export function migrationFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const contents = readFileSync(resolve(dir, name), 'utf8');
      return { name, contents, checksum: createHash('sha256').update(contents).digest('hex') };
    });
}

/** Same split as `splitStatements` in src/lib/db/migrate.ts. */
export function splitStatements(contents) {
  const withoutComments = contents
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

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

function connectionConfig(env, { withDatabase = true } = {}) {
  const host = (env.DATABASE_HOST ?? '').trim();
  const user = (env.DATABASE_USER ?? '').trim();
  const database = (env.DATABASE_NAME ?? '').trim();
  if (!host || !user || (withDatabase && !database)) {
    throw new Error('Set DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER and DATABASE_PASSWORD (or pass --env-file).');
  }
  return {
    host,
    port: Number(env.DATABASE_PORT ?? 3306),
    user,
    password: env.DATABASE_PASSWORD ?? '',
    ...(withDatabase ? { database } : {}),
    multipleStatements: false,
    dateStrings: true,
  };
}

async function serverVersion(connection) {
  const [[row]] = await connection.query('SELECT VERSION() AS version, @@version_comment AS comment');
  return `${row.comment} ${row.version}`;
}

async function tables(connection) {
  const [rows] = await connection.query(
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return rows.map((row) => row.name);
}

async function appliedMigrations(connection, existingTables) {
  if (!existingTables.includes('app_migrations')) return null;
  const [rows] = await connection.query('SELECT name, checksum FROM app_migrations');
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function createDatabaseAndUser(env, args) {
  const host = (env.DATABASE_HOST ?? '').trim();
  if (!LOOPBACK.has(host) && !args.allowHost) {
    throw new Error(
      `Refusing to create a database and user on "${host}": this path mints credentials, so it is limited to loopback. Pass --allow-host if you really mean it.`,
    );
  }
  const adminUser = (env.SERVER_ADMIN_USER ?? 'root').trim();
  const admin = await mysql.createConnection({
    host,
    port: Number(env.DATABASE_PORT ?? 3306),
    user: adminUser,
    password: env.SERVER_ADMIN_PASSWORD ?? '',
    multipleStatements: false,
  });
  const database = env.DATABASE_NAME;
  const user = env.DATABASE_USER;
  const password = env.DATABASE_PASSWORD ?? '';
  const userHost = (env.DATABASE_USER_HOST ?? 'localhost').trim();
  if (!password) {
    await admin.end();
    throw new Error('DATABASE_PASSWORD is empty. Set it (the account is created with this password) or create the user in cPanel and run without --create.');
  }

  console.log(`Would create database \`${database}\` (utf8mb4 / utf8mb4_unicode_ci) and user '${user}'@'${userHost}' with rights on that database only.`);
  if (!args.apply) {
    await admin.end();
    return false;
  }

  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.query(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [user, userHost, password]);
  // A second run with a rotated password must end with the environment's password.
  await admin.query(`ALTER USER ?@? IDENTIFIED BY ?`, [user, userHost, password]);
  await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO ?@?`, [user, userHost]);
  await admin.query('FLUSH PRIVILEGES');
  await admin.end();
  console.log('Database and user created. Rights: everything on this one database, nothing else.');
  return true;
}

async function applyMigrations(env, args) {
  const connection = await mysql.createConnection(connectionConfig(env));
  try {
    console.log(`Server: ${await serverVersion(connection)}`);
    const existing = await tables(connection);
    console.log(`Existing tables in ${env.DATABASE_NAME}: ${existing.length}${existing.length ? ` (${existing.join(', ')})` : ''}`);

    const files = migrationFiles(args.migrationsDir);
    const applied = await appliedMigrations(connection, existing);
    const pending = [];

    for (const file of files) {
      const seen = applied?.get(file.name);
      if (seen) {
        if (seen !== file.checksum) {
          throw new Error(
            `Migration ${file.name} was edited after it ran here (${seen.slice(0, 12)} -> ${file.checksum.slice(0, 12)}). ` +
              'Add a new migration instead of rewriting history.',
          );
        }
        continue;
      }
      pending.push(file);
    }

    console.log(`${files.length} migration files; ${applied ? applied.size : 0} already recorded here; ${pending.length} to apply.`);
    if (!pending.length) {
      console.log('Nothing to do.');
      return;
    }

    if (!args.apply) {
      console.log(`Would apply: ${pending.map((file) => file.name).join(', ')}`);
      console.log('Re-run with --apply to execute.');
      return;
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS app_migrations (
        name VARCHAR(191) PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      )`,
    );

    for (const file of pending) {
      const statements = splitStatements(file.contents);
      for (const statement of statements) await connection.query(statement);
      await connection.query('INSERT INTO app_migrations (name, checksum) VALUES (?, ?)', [file.name, file.checksum]);
      console.log(`  applied ${file.name} (${statements.length} statements)`);
    }

    const after = await tables(connection);
    console.log(`Done. ${after.length} tables now: ${after.join(', ')}`);
  } finally {
    await connection.end();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    apply: false,
    create: false,
    allowHost: false,
    envFile: null,
    migrationsDir: resolve('src/lib/db/migrations'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--create') args.create = true;
    else if (arg === '--allow-host') args.allowHost = true;
    else if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--migrations') args.migrationsDir = resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...process.env, ...(args.envFile ? readEnvFile(args.envFile) : {}) };
  if (args.envFile) console.log(`Environment: ${resolve(args.envFile)} (values are not printed).`);

  if (args.create) await createDatabaseAndUser(env, args);
  else console.log('Create step skipped (pass --create only if the database and user do not exist yet).');

  await applyMigrations(env, args);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
