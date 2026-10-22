/**
 * npm run db:migrate            -> show what would run (default, changes nothing)
 * npm run db:migrate -- --apply -> run it
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { migrate, migrationFiles, tableNames } from '../../src/lib/db/migrate';
import { destroyDb } from '../../src/lib/db/index';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const files = migrationFiles();

  console.log(`${files.length} migration files on disk:`);
  for (const file of files) console.log(`  ${file.name}  ${file.checksum.slice(0, 12)}`);
  console.log();

  const result = await migrate({ dryRun: !apply });

  if (result.dryRun) {
    console.log(`DRY RUN against ${result.database} — nothing executed.`);
    console.log(result.applied.length ? `Would apply: ${result.applied.join(', ')}` : 'Everything is already applied.');
    console.log('Re-run with --apply to execute.');
  } else {
    console.log(`Applied ${result.applied.length} migration(s) to ${result.database}; ${result.skipped.length} already present.`);
  }

  const tables = await tableNames();
  console.log(`${tables.length} tables: ${tables.join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
