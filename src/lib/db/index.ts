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
import type { Database, Db } from './types';

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function readDbConfig(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const url = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  const config = {
    host: env.DATABASE_HOST ?? url?.hostname ?? '',
    port: Number(env.DATABASE_PORT ?? url?.port ?? 3306),
    user: decodeURIComponent(env.DATABASE_USER ?? url?.username ?? ''),
    password: decodeURIComponent(env.DATABASE_PASSWORD ?? url?.password ?? ''),
    database: (env.DATABASE_NAME ?? url?.pathname.replace(/^\//, '') ?? '').trim(),
  };
  if (!config.host || !config.user || !config.database) {
    throw new Error(
      'Incomplete database configuration. Set DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME (or DATABASE_URL). See docs/LOCAL-MARIADB.md.',
    );
  }
  return config;
}

/**
 * Cached across hot reloads in `next dev`: a new pool per module evaluation would
 * exhaust MariaDB's connections while you edit.
 */
const globalForDb = globalThis as typeof globalThis & { __shamahDb?: Db };

export function getDb(): Db {
  if (globalForDb.__shamahDb) return globalForDb.__shamahDb;
  const config = readDbConfig();
  const db = new Kysely<Database>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 8),
        // Keep DATETIME(3) as Date and DECIMAL as string, so a price never loses cents to a float.
        dateStrings: false,
        decimalNumbers: false,
        multipleStatements: false,
        enableKeepAlive: true,
      }),
    }),
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
