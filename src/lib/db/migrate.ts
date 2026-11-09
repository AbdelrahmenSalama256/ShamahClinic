/**
 * The migration runner.
 *
 * Files in src/lib/db/migrations run in filename order, once. Each applied file is
 * recorded with a checksum, so an already-applied migration that was edited afterwards
 * stops the run instead of silently diverging from what the deployed database holds.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import { getDb, readDbConfig } from './index';

export interface MigrationFile {
  name: string;
  contents: string;
  checksum: string;
  /** The same text hashed with CRLF endings: what a run from a Windows checkout recorded. */
  crlfChecksum: string;
}

export function migrationsDir(): string {
  return path.resolve(process.cwd(), 'src/lib/db/migrations');
}

export function migrationFiles(dir = migrationsDir()): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      // A Windows checkout (core.autocrlf) turns LF into CRLF; the checksum is of the text, not
      // of whichever line endings git wrote, or every Windows worktree reads as "edited".
      const contents = readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
      return {
        name,
        contents,
        checksum: createHash('sha256').update(contents).digest('hex'),
        crlfChecksum: createHash('sha256').update(contents.replace(/\n/g, '\r\n')).digest('hex'),
      };
    });
}

export function splitStatements(contents: string): string[] {
  const withoutComments = contents
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export interface MigrateResult {
  database: string;
  applied: string[];
  skipped: string[];
  dryRun: boolean;
}

export async function migrate(options: { dryRun?: boolean } = {}): Promise<MigrateResult> {
  const dryRun = options.dryRun ?? true;
  const db = getDb();
  const { database } = readDbConfig();
  const files = migrationFiles();

  await sql`CREATE TABLE IF NOT EXISTS app_migrations (
    name VARCHAR(191) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`.execute(db);

  const appliedRows = await db.selectFrom('app_migrations').select(['name', 'checksum']).execute();
  const byName = new Map(appliedRows.map((row) => [row.name, row.checksum]));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const seen = byName.get(file.name);
    if (seen) {
      if (seen !== file.checksum && seen !== file.crlfChecksum) {
        throw new Error(
          `Migration ${file.name} was edited after it ran (${seen.slice(0, 12)} -> ${file.checksum.slice(0, 12)}). ` +
            'Add a new migration instead of rewriting history.',
        );
      }
      skipped.push(file.name);
      continue;
    }
    if (dryRun) {
      applied.push(file.name);
      continue;
    }
    for (const statement of splitStatements(file.contents)) {
      await sql.raw(statement).execute(db);
    }
    await db.insertInto('app_migrations').values({ name: file.name, checksum: file.checksum }).execute();
    applied.push(file.name);
  }

  return { database, applied, skipped, dryRun };
}

export async function tableNames(): Promise<string[]> {
  const result = await sql<{ t: string }>`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()`.execute(
    getDb(),
  );
  return result.rows.map((row) => row.t).sort();
}
