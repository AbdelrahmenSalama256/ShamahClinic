import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
/** The URL names the view and the scope: `?list=branches` deep-links one of the site's lists. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleListsPage({ searchParams }: Props) {
  return <ContentScreen kind="list_item" titleKey="nav.lists" search={await searchParams} />;
}
