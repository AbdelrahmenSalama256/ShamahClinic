import { notFound } from 'next/navigation';
import { ContentScreen } from '@/components/console/ContentScreen';
import { knownListKeys } from '@/lib/content/store';

export const dynamic = 'force-dynamic';

interface Props {
  /** `/console/results`: one named list's own section. */
  params: Promise<{ kind: string }>;
  /** The list's view: `?trash=1`, `?q=`, a filter, a page. The list is in the path. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A list-backed entity's section.
 *
 * The segment is the `lists.list_key` (`results`, `branches`, …), checked against the
 * registered lists rather than a hardcoded map, so a list added to the catalog gets a
 * screen without a route edit. Everything else on this level is a static page (`articles`,
 * `settings`, …) or a 404 — the dynamic segment never swallows those.
 */
export default async function ConsoleListSectionPage({ params, searchParams }: Props) {
  const { kind } = await params;
  if (!(await knownListKeys()).includes(kind)) notFound();

  return <ContentScreen kind="list_item" titleKey="nav.lists" listKey={kind} search={await searchParams} />;
}
