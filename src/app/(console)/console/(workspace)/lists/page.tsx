import { redirect } from 'next/navigation';
import { listSectionPath } from '@/lib/console/paths';
import { knownListKeys } from '@/lib/content/store';

export const dynamic = 'force-dynamic';

interface Props {
  /** The old screen's whole query: `?list=` chose a list, the rest is the view it showed. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The aggregate lists screen is gone; each list has its own section now.
 *
 * Old bookmarks and palette hits still say `/console/lists?list=branches`, so this route
 * answers with the section that replaces it and keeps every other term (`?trash=1`, a
 * filter, a page) intact. With no `?list=` the example list — result stories, the one with
 * a gallery — is the landing, and the first registered list is the fallback.
 */
export default async function ConsoleListsRedirect({ searchParams }: Props) {
  const search = await searchParams;
  const asked = search.list;
  const wanted = (Array.isArray(asked) ? asked[0] : asked)?.trim();

  const known = await knownListKeys();
  const target = wanted && known.includes(wanted) ? wanted : known.includes('results') ? 'results' : known[0];
  if (!target) redirect('/console');

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    const text = Array.isArray(value) ? value[0] : value;
    if (key !== 'list' && text !== undefined) params.set(key, text);
  }
  const query = params.toString();
  redirect(`${listSectionPath(target)}${query ? `?${query}` : ''}`);
}
