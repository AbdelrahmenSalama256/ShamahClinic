/**
 * CLI scripts do not run inside Next, so they load the env file themselves.
 * `.env.local` for development, `.env.test` for tests and destructive probes.
 */
import dotenv from 'dotenv';

export function loadEnv(): void {
  const file = process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local';
  const result = dotenv.config({ path: file });
  if (result.error) {
    throw new Error(
      `Missing ${file}: ${result.error.message}. Provision it with "npm run db:local:provision" (docs/LOCAL-MARIADB.md).`,
    );
  }
}
