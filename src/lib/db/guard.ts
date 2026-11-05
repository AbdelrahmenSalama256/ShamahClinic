/**
 * Guard rails that keep a test or a destructive script away from real data.
 * Read docs/LOCAL-MARIADB.md for the two local databases this is written around.
 */
import { readDbConfig } from './index';

/** Databases no destructive command may ever touch, whatever the env says. */
const REFUSED = ['shamah_cms', 'mysql', 'information_schema', 'performance_schema', 'payload'];

export function assertTestDb(env: NodeJS.ProcessEnv = process.env): string {
  const { database } = readDbConfig(env);
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to run against "${database}": tests and destructive probes only target a database ending in _test.`,
    );
  }
  return database;
}

export function assertNotProduction(target: string, env: NodeJS.ProcessEnv = process.env): void {
  const { database } = readDbConfig(env);
  if (REFUSED.includes(database) && target !== 'explicit-override') {
    throw new Error(
      `Refusing a destructive operation against "${database}". Pass --force-database to override, and only against a copy.`,
    );
  }
}
