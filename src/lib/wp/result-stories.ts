import { getAllArticles, paginate } from "./index";
import { snapshotResultStories } from "./snapshot";
import type { ArticleCard, Paged } from "./types";

/**
 * A result story is a WordPress post whose own text names an outcome. The
 * dashboard holds no result records and no before/after media — see
 * docs/RESULTS-SOURCE.md — so the article body is the only data that says "this
 * one is about a result". Membership comes from the phrase index `sync:wp` derives
 * from those bodies; the card itself (cover, title, excerpt, date) is still read
 * from the posts API, so a reworded article is fresh without a re-sync.
 */
export interface ResultStory {
  card: ArticleCard;
  phrases: string[];
}

export async function getResultStories(
  q: { page?: number; perPage?: number } = {},
): Promise<Paged<ResultStory>> {
  const byId = new Map(snapshotResultStories().map((row) => [row.id, row.phrases]));
  const cards = await getAllArticles();
  const stories = cards
    .filter((card) => byId.has(card.id))
    .map((card) => ({ card, phrases: byId.get(card.id)! }));
  return paginate(stories, q.page, q.perPage);
}
