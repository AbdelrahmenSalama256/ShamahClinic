/**
 * npm run wp:import                     -> show what the snapshot would write (default, writes nothing)
 * npm run wp:import -- --apply          -> write it
 * npm run wp:import -- --force-database --apply
 *                                       -> also allowed against a database not named *_test
 *
 * Imports the frozen WordPress snapshot (`data/wp/*.json`) as console rows: the 92
 * articles, 4 offers, 27 pages, the post categories they point at, and the 56 result
 * stories' membership in the `results` list (7.5 — that list is why `/results` no longer
 * reads `result-stories.json` while rendering). The source is
 * the committed files, so this never asks the client's production WordPress for
 * anything, and a row that already matches the snapshot is left alone — re-running
 * adds no revisions.
 *
 * It refuses a database that does not end in `_test` unless `--force-database`,
 * because publishing the import is what hands the live site to the database: each
 * kind's rows go published, and the read path takes a kind from the snapshot the
 * moment it holds one published row.
 */
import { loadEnv } from '../../src/lib/db/load-env';
loadEnv();

import { assertTestDb } from '../../src/lib/db/guard';
import { destroyDb, readDbConfig } from '../../src/lib/db/index';
import { planArticles, planCategories, planOffers, planPages, planResultStories, importSnapshot } from '../../src/lib/content/import-wp';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const forced = process.argv.includes('--force-database');
  const database = forced ? readDbConfig().database : assertTestDb();

  const docs = {
    article: planArticles().length,
    offer: planOffers().length,
    page: planPages().length,
    results: planResultStories().length,
  };
  console.log(`WordPress snapshot — ${docs.article + docs.offer + docs.page + docs.results} rows, database ${database}`);
  console.log(`  article ${docs.article}  offer ${docs.offer}  page ${docs.page}  category ${planCategories().length}  result story ${docs.results}`);
  console.log();

  const report = await importSnapshot({ apply, database });
  console.log(
    `  would create ${report.rows.created}   ` +
      `would update ${report.rows.updated}   ` +
      `already matching ${report.rows.unchanged}` +
      (report.skipped.length ? `   skipped ${report.skipped.length}` : ''),
  );
  console.log(`  categories: ${report.categories.created} to create, ${report.categories.existed} already present`);
  for (const row of report.skipped) console.log(`  SKIPPED ${row.kind} ${row.key}: ${row.why}`);

  console.log();
  if (report.dryRun) {
    console.log('DRY RUN — nothing was written. Re-run with --apply.');
    return;
  }
  console.log(
    `Imported. ${report.rows.created} row(s) created, ${report.rows.updated} rewritten, ${report.rows.unchanged} unchanged. ` +
      'The site now answers those kinds from the database.',
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
