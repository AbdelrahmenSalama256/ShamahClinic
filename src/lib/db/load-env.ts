/**
 * CLI scripts do not run inside Next, so they load the env file themselves.
 * `.env.local` for development, `.env.test` for tests and destructive probes.
 */
import dotenv from 'dotenv';

export function loadEnv(): void {
  const inlineArg = process.argv.find((arg) => arg.startsWith('--env-file='));
  const flagIndex = process.argv.indexOf('--env-file');
  if (inlineArg && flagIndex !== -1) {
    throw new Error('Use either --env-file <path> or --env-file=<path>, not both.');
  }

  const explicitFile = inlineArg
    ? inlineArg.slice('--env-file='.length)
    : flagIndex !== -1
      ? process.argv[flagIndex + 1]
      : undefined;
  if ((flagIndex !== -1 || inlineArg) && (!explicitFile || explicitFile.startsWith('--'))) {
    throw new Error('Missing path after --env-file.');
  }

  const file = explicitFile ?? (process.env.NODE_ENV === 'test' ? '.env.test' : '.env.local');
  const result = dotenv.config({ path: file });
  if (result.error) {
    if (explicitFile) {
      throw new Error(`Unable to load environment file "${file}": ${result.error.message}.`);
    }
    throw new Error(
      `Missing ${file}: ${result.error.message}. Provision it with "npm run db:local:provision" (docs/LOCAL-MARIADB.md).`,
    );
  }
}
