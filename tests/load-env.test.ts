import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/lib/db/load-env';

describe('loadEnv', () => {
  const originalArgv = process.argv;
  const key = 'SHAMAH_LOAD_ENV_TEST';
  const originalValue = process.env[key];

  afterEach(() => {
    process.argv = originalArgv;
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  });

  it('loads an explicitly supplied env file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'shamah-env-'));
    const file = join(directory, 'test.env');
    writeFileSync(file, `${key}=loaded\n`);

    try {
      process.argv = ['node', 'script', '--env-file', file];
      loadEnv();
      expect(process.env[key]).toBe('loaded');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a missing env file path', () => {
    process.argv = ['node', 'script', '--env-file'];
    expect(() => loadEnv()).toThrow('Missing path after --env-file.');
  });

  it('rejects conflicting env file options', () => {
    process.argv = ['node', 'script', '--env-file', 'first.env', '--env-file=second.env'];
    expect(() => loadEnv()).toThrow('Use either --env-file <path> or --env-file=<path>, not both.');
  });
});
