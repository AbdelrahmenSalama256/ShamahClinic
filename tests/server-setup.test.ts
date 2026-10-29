/**
 * The server setup script is plain JavaScript because the uploaded artifact has no
 * TypeScript toolchain, which means there are now two migration readers. This file holds
 * them to each other: same files, same order, same checksums, same statement split. A
 * server database that recorded a different checksum would be refused by the app's own
 * runner on the next deploy.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as setup from '../scripts/db/server-setup.mjs';
import { migrationFiles, migrationsDir, splitStatements } from '@/lib/db/migrate';

const scratch = mkdtempSync(join(tmpdir(), 'shamah-setup-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('server-setup agrees with the TypeScript migration runner', () => {
  const files = migrationFiles();

  it('finds the same files, in the same order, with the same checksums', () => {
    const fromScript = setup.migrationFiles(migrationsDir());
    expect(fromScript.map((file) => ({ name: file.name, checksum: file.checksum }))).toEqual(
      files.map((file) => ({ name: file.name, checksum: file.checksum })),
    );
    expect(fromScript.length).toBe(10);
    expect(fromScript[0].name).toBe('001_auth.sql');
    expect(fromScript.at(-1)?.name).toBe('010_tracking.sql');
  });

  it('splits every migration into exactly the statements the runner executes', () => {
    for (const file of files) {
      expect(setup.splitStatements(file.contents), file.name).toEqual(splitStatements(file.contents));
    }
  });

  it('reads an env file without printing or expanding values', () => {
    const path = join(scratch, 'server.env');
    writeFileSync(
      path,
      ['# comment', 'DATABASE_HOST=127.0.0.1', 'DATABASE_PORT="3306"', "DATABASE_PASSWORD='p a s s'", '', 'NOT_AN_ASSIGNMENT'].join('\n'),
    );
    expect(setup.readEnvFile(path)).toEqual({
      DATABASE_HOST: '127.0.0.1',
      DATABASE_PORT: '3306',
      DATABASE_PASSWORD: 'p a s s',
    });
  });

  it('creates the account at the host the app connects from, unless told otherwise', () => {
    expect(setup.accountHost({ DATABASE_HOST: 'localhost' })).toBe('localhost');
    expect(setup.accountHost({ DATABASE_HOST: '127.0.0.1' })).toBe('127.0.0.1');
    expect(setup.accountHost({ DATABASE_HOST: '127.0.0.1', DATABASE_USER_HOST: 'localhost' })).toBe('localhost');
  });
});
