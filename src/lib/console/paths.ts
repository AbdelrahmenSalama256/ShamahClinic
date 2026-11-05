/**
 * Where each content kind lives in the console.
 *
 * One map because four screens, the palette and every row link have to agree on the same
 * URL. The detail route is a real page
 * (`/console/articles/<id>`), not a pane beside the list: a document is a place, it can
 * be bookmarked, and opening one does not throw away the list you found it in.
 *
 * A list item is the one kind whose address also names its list: branches and result
 * stories are different content edited on different screens, so `/console/branches/<id>`
 * is the item and `/console/lists/<id>` is only the old address that redirects here.
 */
import type { ContentKind } from '../content/kinds';

export const CONTENT_PATHS: Record<ContentKind, string> = {
  article: '/console/articles',
  offer: '/console/offers',
  page: '/console/pages',
  // The aggregate list is a redirect now; a list's own section is `listSectionPath`.
  list_item: '/console/lists',
};

/** The section a named list lives in — `/console/branches`, `/console/results`. */
export function listSectionPath(listKey: string): string {
  return `/console/${encodeURIComponent(listKey)}`;
}

/** A kind's list screen. A list item needs its key; without one this is the old redirect. */
export function contentPath(kind: ContentKind, listKey?: string | null): string {
  if (kind === 'list_item' && listKey) return listSectionPath(listKey);
  return CONTENT_PATHS[kind];
}

export function contentDetailPath(kind: ContentKind, id: string, listKey?: string | null): string {
  return `${contentPath(kind, listKey)}/${encodeURIComponent(id)}`;
}
