import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
  /** `?list=branches` deep-links one of the seven site lists; the tabs set it back. */
  searchParams: Promise<{ list?: string; key?: string; trash?: string }>;
}

export default async function ConsoleListsPage({ searchParams }: Props) {
  const params = await searchParams;
  return <ContentScreen kind="list_item" titleKey="nav.lists" listKey={params.list ?? null} focusKey={params.key ?? null} trash={params.trash === '1'} />;
}
