/**
 * `npm run doctor` — one command that says whether this machine can run the console.
 * It only reads (the single write is `CREATE TABLE IF NOT EXISTS app_migrations`
 * inside the migration runner). Prints environment variable NAMES, never values.
 * Exits 1 when anything a later step depends on is missing.
 */
import { sql } from 'kysely';
import { loadEnv } from '../src/lib/db/load-env';
loadEnv();

import { destroyDb, getDb, readDbConfig } from '../src/lib/db/index';
import { migrationFiles, migrate, tableNames } from '../src/lib/db/migrate';

const REQUIRED_ENV = [
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_NAME',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'SESSION_SECRET',
];
const problems: string[] = [];

function ok(label: string, detail = ''): void {
  console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
}
function bad(label: string, detail: string): void {
  problems.push(`${label}: ${detail}`);
  console.log(`  FAIL ${label} — ${detail}`);
}

function checkEnv(): void {
  console.log('\nEnvironment');
  for (const name of REQUIRED_ENV) {
    if (process.env[name]) ok(name, 'set');
    else bad(name, 'not set — copy .env.example to .env.local and fill it in');
  }
  const node = process.versions.node;
  if (Number(node.split('.')[0]) >= 20) ok('node', node);
  else bad('node', `${node} is too old; 20+ required`);
}

async function checkDatabase(): Promise<void> {
  console.log('\nDatabase');
  let config: ReturnType<typeof readDbConfig>;
  try {
    config = readDbConfig();
  } catch (error) {
    bad('connection config', error instanceof Error ? error.message : String(error));
    return;
  }
  ok('connection config', `${config.host}:${config.port}/${config.database} (values withheld)`);

  try {
    const probe = await sql<{ v: string; d: string }>`SELECT VERSION() AS v, DATABASE() AS d`.execute(getDb());
    ok('connected', `${probe.rows[0].d} on ${probe.rows[0].v}`);
  } catch (error) {
    bad('connect', error instanceof Error ? error.message : String(error));
    return;
  }

  ok('tables', `${(await tableNames()).length}`);

  const applied = await sql<{ name: string }>`SELECT name FROM app_migrations ORDER BY name`.execute(getDb());
  const names = new Set(applied.rows.map((row) => row.name));
  const pending = migrationFiles().filter((file) => !names.has(file.name));
  if (pending.length === 0) ok('migrations', `${names.size} applied`);
  else bad('migrations', `not applied: ${pending.map((f) => f.name).join(', ')} — npm run db:migrate -- --apply`);

  // A dry run re-checksums every applied file and throws if one was edited afterwards.
  try {
    const dry = await migrate({ dryRun: true });
    ok('checksums', `${dry.skipped.length} applied file(s) match what is on disk`);
  } catch (error) {
    bad('checksums', error instanceof Error ? error.message : String(error));
  }
}

async function checkContent(): Promise<void> {
  console.log('\nContent');
  for (const table of ['users', 'articles', 'offers', 'settings']) {
    try {
      const rows = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.table(table)}`.execute(getDb());
      ok(table, `${Number(rows.rows[0].n)} rows`);
    } catch (error) {
      bad(table, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main(): Promise<void> {
  console.log('Shamah console doctor');
  checkEnv();
  await checkDatabase();
  await checkContent();
  console.log('');
  if (problems.length) {
    console.log(`${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void destroyDb();
  });
