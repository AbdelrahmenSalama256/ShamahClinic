/**
 * Connection config and the Kysely instance.
 *
 * One dialect — MySQL/MariaDB — because that is what cPanel hosts. There is no
 * Postgres-in-development path to diverge at deploy time.
 */
import { Kysely, MysqlDialect } from 'kysely';
// Kysely's MysqlDialect drives the callback API and never completes against
// `mysql2/promise`, so the pool is created from `mysql2` itself.
import { createPool } from 'mysql2';
import type { PoolOptions } from 'mysql2';
import { readFileSync } from 'node:fs';
import type { Database, Db } from './types';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  socketPath?: string;
}

export type Env = Record<string, string | undefined>;

export function readDbConfig(env: Env = process.env): DbConfig {
  const url = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  const socketPath = env.DATABASE_SOCKET?.trim();
  const config = {
    host: env.DATABASE_HOST ?? env.DB_HOST ?? url?.hostname ?? '',
    port: Number(env.DATABASE_PORT ?? env.DB_PORT ?? url?.port ?? 3306),
    user: decodeURIComponent(env.DATABASE_USER ?? env.DB_USER ?? url?.username ?? ''),
    password: decodeURIComponent(env.DATABASE_PASSWORD ?? env.DB_PASSWORD ?? url?.password ?? ''),
    database: (env.DATABASE_NAME ?? env.DB_NAME ?? url?.pathname.replace(/^\//, '') ?? '').trim(),
    ...(socketPath ? { socketPath } : {}),
  };
  if ((!config.host && !socketPath) || !config.user || !config.database) {
    throw new Error(
      'Incomplete database configuration. Set DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME (or cPanel DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, or DATABASE_URL). Set DATABASE_SOCKET to connect through a local Unix socket instead of a host and port. See docs/LOCAL-MARIADB.md.',
    );
  }
  return config;
}

export function poolOptions(config: DbConfig): PoolOptions {
  const tls = readTls();
  return {
    ...(config.socketPath ? { socketPath: config.socketPath } : { host: config.host, port: config.port }),
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 8),
    // Keep DATETIME(3) as Date and DECIMAL as string, so a price never loses cents to a float.
    dateStrings: false,
    decimalNumbers: false,
    multipleStatements: false,
    enableKeepAlive: true,
    ...(tls ? { ssl: tls } : {}),
  };
}

/**
 * TLS is off unless an operator asks for it, and the only place to ask is the environment.
 * Production runs MariaDB on the same machine, reached over the loopback interface, so
 * encrypting that hop buys nothing and a certificate that expires at 3 a.m. buys less.
 * A remote database (a staging copy, a managed box someone else insists on) sets
 * `DATABASE_TLS=require` for encryption or `DATABASE_TLS=verify` to also check the
 * certificate against the system roots, or against `DATABASE_TLS_CA_FILE` when the server
 * has a private CA.
 */
export type DbTls = false | { rejectUnauthorized: boolean; ca?: Buffer };

export function readTls(env: Env = process.env): DbTls {
  const mode = (env.DATABASE_TLS ?? '').trim().toLowerCase();
  if (!mode || mode === 'off' || mode === 'false' || mode === '0' || mode === 'disable') return false;
  if (mode !== 'require' && mode !== 'verify') {
    throw new Error(`DATABASE_TLS must be one of: (unset), require, verify. Got "${env.DATABASE_TLS}".`);
  }
  const caFile = (env.DATABASE_TLS_CA_FILE ?? '').trim();
  const ca = caFile ? readFileSync(caFile) : undefined;
  return { rejectUnauthorized: mode === 'verify', ...(ca ? { ca } : {}) };
}

/**
 * Cached across hot reloads in `next dev`: a new pool per module evaluation would
 * exhaust MariaDB's connections while you edit.
 */
const globalForDb = globalThis as typeof globalThis & { __shamahDb?: Db };

export function getDb(): Db {
  if (globalForDb.__shamahDb) return globalForDb.__shamahDb;
  const config = readDbConfig();
  const options = poolOptions(config);
  const db = new Kysely<Database>({
    dialect: new MysqlDialect({ pool: createPool(options) }),
    // A diagnostic, off unless asked for: `DATABASE_LOG_QUERIES=1` prints the SQL of every
    // statement (placeholders only, no bound values) so a route's query count can be read
    // off the server log. It costs a string per query and must stay off in normal service.
    ...(process.env.DATABASE_LOG_QUERIES === '1'
      ? { log: (event: { query: { sql: string }; queryDurationMillis: number }) => console.log(`[dbq] ${event.queryDurationMillis.toFixed(1)}ms ${event.query.sql}`) }
      : {}),
  });
  globalForDb.__shamahDb = db;
  return db;
}

/**
 * Import-safe lazy handle. Kysely's instance keeps state in private fields, so the
 * proxy hands back functions already bound to the real instance instead of a
 * receiver the class never declared.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop as string];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

/** CLI scripts must call this or the open pool keeps the process alive. */
export async function destroyDb(): Promise<void> {
  if (globalForDb.__shamahDb) {
    await globalForDb.__shamahDb.destroy();
    delete globalForDb.__shamahDb;
  }
}
