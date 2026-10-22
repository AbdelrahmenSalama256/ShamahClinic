/**
 * npm run owner:create -- --email you@example.com [--name "Own Name"] [--locale ar] [--role Owner] --apply
 *
 * Dry-run by default, like every mutating command here. The password is typed at
 * a hidden prompt or piped with --password-stdin; it is never an argument, so it
 * cannot end up in shell history or a CI log.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { readDbConfig, destroyDb } from '../../src/lib/db/index';
import { passwordProblem } from '../../src/lib/auth/password';
import { writeAudit } from '../../src/lib/auth/audit';
import { assignRole, createUser, findRoleByName, getOrCreateRole, normalizeEmail } from '../../src/lib/auth/users';
import { readSecret } from './read-secret';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const rawEmail = flag('email');
  if (!rawEmail) throw new Error('Usage: npm run owner:create -- --email you@example.com [--name "Own Name"] [--locale ar] [--role Owner] [--apply]');
  const email = normalizeEmail(rawEmail);
  const roleName = flag('role') ?? 'Owner';
  const apply = process.argv.includes('--apply');
  const database = readDbConfig().database;

  const password = await readSecret(`Password for ${email}`);
  const problem = passwordProblem(password);
  if (problem) throw new Error(`${problem} Nothing was written.`);

  const role = await findRoleByName(roleName);
  console.log(`Database : ${database}`);
  console.log(`Email    : ${email}`);
  console.log(`Role     : ${roleName}${role ? ' (exists)' : ' (will be created)'}`);
  console.log(`Password : stored as a bcrypt hash, cost 12 — the value is not kept anywhere`);

  if (!apply) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply.');
    return;
  }

  const userId = await createUser({ email, password, name: flag('name') ?? '', locale: flag('locale') ?? 'ar' });
  const roleId = roleName === 'Owner'
    ? await getOrCreateRole('Owner', { description: 'Full access, including other users.', is_system: true, is_owner: true })
    : await getOrCreateRole(roleName, { is_system: true });
  await assignRole(userId, roleId);

  await writeAudit({
    actorId: null,
    actorEmail: 'cli:owner:create',
    actorKind: 'cli',
    action: 'owner.create',
    entityType: 'user',
    entityId: userId,
    after: { email, role: roleName },
  });
  console.log(`\nCreated ${email} (id ${userId}) with role ${roleName}. Sign in at /console.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
