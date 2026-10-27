/**
 * The connection config is the first thing the server touches and the first thing a
 * migration run touches, so its defaults are asserted rather than assumed:
 *
 * - TLS is off unless `DATABASE_TLS` says otherwise. Production is MariaDB on the same
 *   machine, and an encrypted loopback hop is not worth a certificate that can expire.
 * - The five discrete variables win over `DATABASE_URL`, because a panel that sets both
 *   must not have its values overridden by an older URL.
 * - An incomplete config fails loudly at import-time use rather than connecting to an
 *   empty-string host and timing out.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDbConfig, readTls } from '@/lib/db';

const scratch = mkdtempSync(join(tmpdir(), 'shamah-db-config-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('readTls', () => {
  it('is off when the variable is absent', () => {
    expect(readTls({})).toBe(false);
  });

  it.each(['off', 'OFF', 'false', '0', 'disable', '  '])('is off for %s', (value) => {
    expect(readTls({ DATABASE_TLS: value })).toBe(false);
  });

  it('encrypts without checking the certificate for `require`', () => {
    expect(readTls({ DATABASE_TLS: 'require' })).toEqual({ rejectUnauthorized: false });
  });

  it('checks the certificate for `verify`', () => {
    expect(readTls({ DATABASE_TLS: 'verify' })).toEqual({ rejectUnauthorized: true });
  });

  it('reads the CA file named by DATABASE_TLS_CA_FILE', () => {
    const caFile = join(scratch, 'ca.pem');
    writeFileSync(caFile, '-----BEGIN CERTIFICATE-----\nnot-a-real-cert\n-----END CERTIFICATE-----\n');
    const tls = readTls({ DATABASE_TLS: 'verify', DATABASE_TLS_CA_FILE: caFile });
    expect(tls).not.toBe(false);
    expect(tls && tls.rejectUnauthorized).toBe(true);
    expect(tls && tls.ca?.toString()).toContain('not-a-real-cert');
  });

  it('refuses a value it does not understand instead of guessing', () => {
    expect(() => readTls({ DATABASE_TLS: 'yes' })).toThrow(/DATABASE_TLS must be one of/);
  });
});

describe('readDbConfig', () => {
  it('reads the five discrete variables', () => {
    expect(
      readDbConfig({
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '3306',
        DATABASE_USER: 'shamah_app',
        DATABASE_PASSWORD: 'secret',
        DATABASE_NAME: 'shamah_cms',
      }),
    ).toEqual({ host: '127.0.0.1', port: 3306, user: 'shamah_app', password: 'secret', database: 'shamah_cms' });
  });

  it('lets the discrete variables win over DATABASE_URL', () => {
    const config = readDbConfig({
      DATABASE_URL: 'mysql://url_user:url_pass@url-host:3307/url_db',
      DATABASE_HOST: '127.0.0.1',
      DATABASE_USER: 'panel_user',
      DATABASE_PASSWORD: 'panel_pass',
      DATABASE_NAME: 'panel_db',
    });
    expect(config).toEqual({ host: '127.0.0.1', port: 3307, user: 'panel_user', password: 'panel_pass', database: 'panel_db' });
  });

  it('falls back to DATABASE_URL on its own', () => {
    const config = readDbConfig({ DATABASE_URL: 'mysql://url_user:url_pass@db.local:3306/url_db' });
    expect(config).toEqual({ host: 'db.local', port: 3306, user: 'url_user', password: 'url_pass', database: 'url_db' });
  });

  it('throws when the host, user or name is missing', () => {
    expect(() => readDbConfig({ DATABASE_USER: 'u', DATABASE_NAME: 'd' })).toThrow(/Incomplete database configuration/);
    expect(() => readDbConfig({ DATABASE_HOST: 'h', DATABASE_NAME: 'd' })).toThrow(/Incomplete database configuration/);
    expect(() => readDbConfig({ DATABASE_HOST: 'h', DATABASE_USER: 'u' })).toThrow(/Incomplete database configuration/);
  });
});
