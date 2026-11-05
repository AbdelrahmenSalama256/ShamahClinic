/**
 * npm run track:maintain
 *
 * Roll every closed day that has new events into the daily tables, prune raw events
 * past the 400-day window, and move the rollup watermark. Safe to run any number of
 * times: each day is deleted and rebuilt from `stats_events`, never added to.
 *
 * The site also runs this opportunistically from `/api/track` (at most every 30
 * minutes), so this script is for the host that would rather have a cron entry and a
 * log line than work that happens inside a visitor's request.
 */
import { loadEnv } from '../src/lib/db/load-env';
loadEnv();

import { destroyDb } from '../src/lib/db/index';
import { maintain } from '../src/lib/tracking/rollup';

async function main(): Promise<void> {
  const result = await maintain();
  console.log(result.from ? `Rolled up ${result.from}..${result.to} into the daily tables.` : 'No closed day had new events.');
  console.log(`Pruned ${result.pruned} raw event(s) older than the retention window.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destroyDb();
  });
