/**
 * npm run db:seed          -> show what the catalogs would change (default, writes nothing)
 * npm run db:seed -- --apply -> write them
 *
 * Seeds the six roles and their `role_permissions` grants from
 * `src/lib/auth/roles.ts`, and the `lists` rows from the same file's `LIST_KEYS` —
 * one command makes the database match both catalogs, so the Editor's scoped grants
 * and the lists they name cannot drift apart. It creates no account on purpose: an
 * account needs a password typed by a human, and that is `npm run owner:create`.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { destroyDb, readDbConfig } from '../../src/lib/db/index';
import { LIST_KEYS, ROLE_SEEDS, syncRoles } from '../../src/lib/auth/roles';
import { syncLists } from '../../src/lib/content/lists';
import { getHeroPhotos } from '../../src/lib/content/site';
import { seedHeroFromPhotos } from '../../src/lib/hero/store';
import { db } from '../../src/lib/db';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { database } = readDbConfig();

  console.log(`Role catalog — ${ROLE_SEEDS.length} roles, database ${database}`);
  console.log();

  const report = await syncRoles({ dryRun: !apply, database });
  for (const row of report.rows) {
    const state = row.existed ? 'exists' : 'will create';
    const changes = [
      row.added ? `${row.added} grant(s) to add` : '',
      row.changed ? `${row.changed} scope(s) to repair` : '',
      row.removed ? `${row.removed} stale grant(s) to drop` : '',
    ].filter(Boolean);
    console.log(
      `  ${row.name.padEnd(9)} ${state.padEnd(11)} ${String(row.wanted).padStart(3)} grant${row.wanted === 1 ? '' : 's'} in catalog` +
        (changes.length ? ` — ${changes.join(', ')}` : ' — already matching'),
    );
  }

  const nothingToChange = report.rows.every((row) => row.added === 0 && row.changed === 0 && row.removed === 0);
  console.log();
  if (report.dryRun) {
    console.log(nothingToChange ? 'DRY RUN — nothing to change.' : 'DRY RUN — nothing was written. Re-run with --apply.');
  } else if (nothingToChange) {
    console.log('Roles already match the catalog.');
  } else {
    const stored = await db.selectFrom('role_permissions').select('id').execute();
    console.log(`Seeded. ${report.rows.filter((row) => !row.existed).length} role(s) created; ${stored.length} grant rows in the database.`);
  }

  console.log(`\nList catalog — ${LIST_KEYS.length} lists`);
  const lists = await syncLists({ dryRun: !apply, database });
  for (const row of lists.rows) {
    console.log(`  ${row.listKey.padEnd(12)} ${row.existed ? 'exists' : 'will create'} — ${row.label}`);
  }
  const missing = lists.rows.filter((row) => !row.existed);
  if (missing.length === 0) {
    console.log('Lists already match the catalog.');
  } else if (lists.dryRun) {
    console.log(`DRY RUN — ${missing.length} list(s) would be created.`);
  } else {
    console.log(`Seeded ${missing.length} list(s).`);
  }

  // The hero becomes an editable slide list without changing a pixel: the seed writes the
  // photographs the homepage already draws as the first rows, and only when none exist.
  console.log('\nHero slider');
  const photos = await getHeroPhotos();
  const hero = await seedHeroFromPhotos(photos, null, { dryRun: !apply });
  if (hero.skipped > 0) {
    console.log(`  ${hero.skipped} slide(s) already in the database — nothing to convert.`);
  } else if (hero.created === 0) {
    console.log('  The imported page publishes no hero photograph — nothing to convert.');
  } else if (!apply) {
    console.log(`  DRY RUN — ${hero.created} slide(s) would be created from the current hero.`);
  } else {
    console.log(`  Seeded ${hero.created} slide(s) from the current hero.`);
  }

  const users = await db.selectFrom('users').select('id').where('deleted_at', 'is', null).execute();
  if (users.length === 0) {
    console.log('\nNo account exists yet. Create the first one with:');
    console.log('  npm run owner:create -- --email you@example.com --apply');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
