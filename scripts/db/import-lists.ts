/**
 * npm run db:import-lists                    -> show what would be imported (writes nothing)
 * npm run db:import-lists -- --apply         -> write the list items
 * npm run db:import-lists -- --force-database --apply
 *                                            -> also allowed against a database not named *_test
 *
 * Fills the console's Services, Branches, Specialists, Questions and Header navigation
 * screens with what the site renders today. The source is the site's own read path, so
 * the import and the public site cannot disagree about a service's name or photo.
 *
 * Re-running is safe: a row whose document already matches is reported `unchanged` and
 * nothing is written, so a second pass adds no revisions and never overwrites an edit
 * with the same words.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { assertTestDb } from '../../src/lib/db/guard';
import { destroyDb, readDbConfig } from '../../src/lib/db/index';
import { planListDocs } from '../../src/lib/content/import-lists';
import { importListItems } from '../../src/lib/content/import-wp';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const forced = process.argv.includes('--force-database');
  const database = forced ? readDbConfig().database : assertTestDb();

  const plan = await planListDocs();
  console.log(`Site lists — ${plan.docs.length} rows, database ${database}`);
  console.log(
    `  services ${plan.services}  branches ${plan.branches}  specialists ${plan.specialists}  questions ${plan.faq}  navigation ${plan.nav}`,
  );
  console.log();

  const report = await importListItems(plan.docs, { apply, database });
  console.log(
    `  would create ${report.rows.created}   ` +
      `would update ${report.rows.updated}   ` +
      `already matching ${report.rows.unchanged}` +
      (report.skipped.length ? `   skipped ${report.skipped.length}` : ''),
  );
  for (const row of report.skipped) console.log(`  SKIPPED ${row.kind} ${row.key}: ${row.why}`);

  console.log();
  if (report.dryRun) {
    console.log('DRY RUN — nothing was written. Re-run with --apply.');
    return;
  }
  console.log(
    `Imported. ${report.rows.created} row(s) created, ${report.rows.updated} rewritten, ${report.rows.unchanged} unchanged. ` +
      'Those lists now come from the database.',
  );
}

main()
  .then(async () => {
    await destroyDb();
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await destroyDb();
    process.exitCode = 1;
  });
