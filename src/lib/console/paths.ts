/**
 * Where each content kind lives in the console.
 *
 * One map because four screens, the palette and every row link have to agree on the same
 * URL. The detail route is a real page
 * (`/console/articles/<id>`), not a pane beside the list: a document is a place, it can
 * be bookmarked, and opening one does not throw away the list you found it in.
 */
import type { ContentKind } from '../content/kinds';

export const CONTENT_PATHS: Record<ContentKind, string> = {
  article: '/console/articles',
  offer: '/console/offers',
  page: '/console/pages',
  list_item: '/console/lists',
};

export function contentPath(kind: ContentKind): string {
  return CONTENT_PATHS[kind];
}

export function contentDetailPath(kind: ContentKind, id: string): string {
  return `${CONTENT_PATHS[kind]}/${encodeURIComponent(id)}`;
}
