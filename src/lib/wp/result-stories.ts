import { snapshotResultStories } from "./snapshot";

/**
 * Which of the 92 articles are result stories.
 *
 * A story is a WordPress post whose own text names an outcome; the dashboard holds no
 * result records and no before/after media — see docs/RESULTS-SOURCE.md — so the
 * phrase index `sync:wp` derives from those bodies is the only thing that says "this
 * one belongs on `/results`".
 *
 * This is the snapshot rung of that membership, and nothing else. A story *is* an
 * article, so joining it onto cards is the site's read path's job (`../content/site`),
 * which asks the `results` list first — reading it here would pair a database card with
 * a file's opinion about which cards to show.
 */
export function storyPhraseIndex(): Map<number, string[]> {
  return new Map(snapshotResultStories().map((row) => [row.id, row.phrases]));
}
