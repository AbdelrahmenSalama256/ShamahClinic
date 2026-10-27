/**
 * The nightly backup's decisions, without running a night.
 *
 * The full run is an integration proof (dump → tar → manifest → prune) and is recorded in
 * docs/PROGRESS.md against a scratch database. What this file pins is the part that can be
 * wrong silently: what a dry run accepts, how a backup folder is named so it sorts, which
 * old folders may be deleted (never anything this script did not create), and the hashes
 * the manifest records.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { backupStamp, folderStats, parseArgs, planRetention, sha256File } from '../scripts/backup/run.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'shamah-backup-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('arguments', () => {
  it('requires an env file, an uploads folder and an output folder', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['--env-file', 'a', '--uploads', 'b'])).toThrow(/Usage/);
  });

  it('is a dry run unless --apply is given, and keeps 7 by default', () => {
    const args = parseArgs(['--env-file', 'a.env', '--uploads', 'u', '--out', 'o']);
    expect(args).toMatchObject({ envFile: 'a.env', uploads: 'u', out: 'o', keep: 7, apply: false });
    expect(parseArgs(['--env-file', 'a', '--uploads', 'u', '--out', 'o', '--apply']).apply).toBe(true);
  });

  it('refuses a retention that would delete everything or mean nothing', () => {
    for (const keep of ['0', '-1', '1.5', 'oops']) {
      expect(() => parseArgs(['--env-file', 'a', '--uploads', 'u', '--out', 'o', '--keep', keep])).toThrow(/--keep/);
    }
  });

  it('refuses an unknown argument instead of ignoring it', () => {
    expect(() => parseArgs(['--env-file', 'a', '--uploads', 'u', '--out', 'o', '--force'])).toThrow(/Unknown argument/);
  });
});

describe('names', () => {
  it('stamps a folder that sorts by time and is legal on every filesystem', () => {
    const stamp = backupStamp(new Date('2026-10-27T12:34:56.789Z'));
    expect(stamp).toBe('backup-2026-10-27T12-34-56Z');
    expect(stamp).not.toMatch(/[:.]/);
    expect(backupStamp(new Date('2026-10-27T12:34:57Z')) > stamp).toBe(true);
  });

  it('keeps the newest N of its own folders and never touches a stranger', () => {
    const names = [
      'backup-2026-10-20T02-00-00Z',
      'backup-2026-10-26T02-00-00Z',
      'backup-2026-10-25T02-00-00Z',
      'notes',
      'backup-2026-10-27T02-00-00Z',
      'backup-manual',
    ];
    expect(planRetention(names, 2)).toEqual({
      keep: ['backup-2026-10-27T02-00-00Z', 'backup-2026-10-26T02-00-00Z'],
      remove: ['backup-2026-10-25T02-00-00Z', 'backup-2026-10-20T02-00-00Z'],
    });
    expect(planRetention(names, 10).remove).toEqual([]);
  });
});

describe('manifest inputs', () => {
  it('counts files and bytes in nested folders', () => {
    mkdirSync(join(scratch, 'uploads', '202610'), { recursive: true });
    writeFileSync(join(scratch, 'uploads', '202610', 'a.webp'), Buffer.alloc(10));
    writeFileSync(join(scratch, 'uploads', '202610', 'b.webp'), Buffer.alloc(5));
    expect(folderStats(join(scratch, 'uploads'))).toEqual({ files: 2, bytes: 15 });
  });

  it('hashes the bytes that will be restored', () => {
    const file = join(scratch, 'one.bin');
    writeFileSync(file, 'abc');
    expect(sha256File(file)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
