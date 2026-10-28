/**
 * The move script decides what "the same data" means, and two of its decisions are the
 * difference between a verified restore and a silent one:
 *
 * - the content hash must not depend on JSON key order (MariaDB does not promise one) or
 *   on row order (a heap has none);
 * - a JSON *string* scalar must be written back as a JSON string. Read back it is the JS
 *   string `20555000111`; inserting that unquoted stores a JSON number, and the settings
 *   readers then see a type they do not expect. Found by this script's own verify step on
 *   a real round trip, not by reasoning.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as move from '../scripts/db/move-data.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'shamah-move-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('move-data refuses to write to a database it was not told about', () => {
  const target = { database: 'user_shamah' };

  it('wants the target named on the command line before it writes', () => {
    expect(() => move.assertConfirmedTarget(target, { apply: true, confirmTarget: null })).toThrow(/--confirm-target user_shamah/);
  });

  it('refuses a name that differs from the env file', () => {
    expect(() => move.assertConfirmedTarget(target, { apply: true, confirmTarget: 'user_other' })).toThrow(/names "user_shamah"/);
  });

  it('accepts a dry run without the flag, and a write that names the same target', () => {
    expect(() => move.assertConfirmedTarget(target, { apply: false, confirmTarget: null })).not.toThrow();
    expect(() => move.assertConfirmedTarget(target, { apply: true, confirmTarget: 'user_shamah' })).not.toThrow();
  });
});

describe('move-data hashing and value conversion', () => {
  it('hashes the same document regardless of key order', () => {
    const a = { title: 'x', meta: { title: 'y', description: 'z' } };
    const b = { meta: { description: 'z', title: 'y' }, title: 'x' };
    expect(move.stableStringify(a)).toBe(move.stableStringify(b));
    expect(move.rowHash(a)).toBe(move.rowHash(b));
  });

  it('keeps arrays in order, because an array is a list and not a set', () => {
    expect(move.stableStringify([1, 2])).not.toBe(move.stableStringify([2, 1]));
  });

  it('hashes a table independently of row order', () => {
    const rows = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ];
    expect(move.tableHash(rows)).toBe(move.tableHash([...rows].reverse()));
  });

  it('keeps a JSON document as JSON text for the INSERT, and leaves scalars alone', () => {
    expect(move.toSqlValue({ phone: '+20 100' })).toBe('{"phone":"+20 100"}');
    expect(move.toSqlValue(['a', 'b'])).toBe('["a","b"]');
    expect(move.toSqlValue('20555000111')).toBe('20555000111');
    expect(move.toSqlValue(null)).toBeNull();
    expect(move.toSqlValue(7)).toBe(7);
  });

  it('quotes a JSON string scalar, so it stays a string and not a number', () => {
    expect(move.toJsonSqlValue('20555000111')).toBe('"20555000111"');
    expect(move.toJsonSqlValue({ a: 1 })).toBe('{"a":1}');
    expect(move.toJsonSqlValue(20555000111)).toBe('20555000111');
    expect(move.toJsonSqlValue(null)).toBeNull();
  });

  it('reads the JSON columns out of the schema checks, not out of column names', () => {
    const columns = move.jsonColumnsFromChecks([
      { table: 'settings', clause: 'json_valid(`value`)' },
      { table: 'audit_log', clause: 'json_valid(`after_json`)' },
      { table: 'leads', clause: 'json_valid(`utm`)' },
      { table: 'articles', clause: 'char_length(`title`) > 0' },
    ]);
    expect(columns).toEqual([
      { table: 'settings', column: 'value' },
      { table: 'audit_log', column: 'after_json' },
      { table: 'leads', column: 'utm' },
    ]);
  });

  it('fingerprints a column by value, not by key order or row order', () => {
    expect(move.valueFingerprint([{ a: 1, b: 2 }, null])).toBe(move.valueFingerprint([null, { b: 2, a: 1 }]));
    expect(move.valueFingerprint([{ a: 1 }])).not.toBe(move.valueFingerprint([{ a: 2 }]));
  });

  it('reads an env file without printing or expanding values', () => {
    const path = join(scratch, 'target.env');
    writeFileSync(path, 'DATABASE_NAME=shamah_cms\nDATABASE_USER="shamah_app"\n');
    expect(move.readEnvFile(path)).toEqual({ DATABASE_NAME: 'shamah_cms', DATABASE_USER: 'shamah_app' });
  });
});
