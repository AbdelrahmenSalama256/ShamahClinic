/**
 * npm run owner:reset -- --email you@example.com --apply
 *
 * The way back in when an Owner is locked out of the console, and the fix for a
 * stolen cookie: it sets a new password and revokes every session of the account.
 * Dry-run by default; the password is typed, never an argument.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { readDbConfig, destroyDb } from '../../src/lib/db/index';
import { writeAudit } from '../../src/lib/auth/audit';
import { findUserByEmail } from '../../src/lib/auth/sessions';
import { normalizeEmail, setPassword } from '../../src/lib/auth/users';
import { readSecret } from './read-secret';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const rawEmail = flag('email');
  if (!rawEmail) throw new Error('Usage: npm run owner:reset -- --email you@example.com [--apply]');
  const email = normalizeEmail(rawEmail);
  const apply = process.argv.includes('--apply');
  const database = readDbConfig().database;

  const account = await findUserByEmail(email);
  if (!account) throw new Error(`No user with email ${email} in ${database}. Nothing was written.`);

  const password = await readSecret(`New password for ${email}`);
  console.log(`Database : ${database}`);
  console.log(`User     : ${email} (id ${account.id}, status ${account.status})`);
  console.log('Effect   : new bcrypt hash, must_change_password cleared, every session of this account revoked');

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
    return;
  }

  await setPassword(account.id, password);
  await writeAudit({
    actorId: account.id,
    actorEmail: 'cli:owner:reset',
    actorKind: 'cli',
    action: 'owner.reset',
    entityType: 'user',
    entityId: account.id,
    after: { email, sessions_revoked: true },
  });
  console.log(`\nPassword reset for ${email}. All their sessions are gone.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
