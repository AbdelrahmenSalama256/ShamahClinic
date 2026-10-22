import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
  /** The URL names the view: `?locale=` the tab, `?key=` the row, `?trash=1` the Trash. */
  searchParams: Promise<{ locale?: string; key?: string; trash?: string }>;
}

export default async function ConsoleArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  return <ContentScreen kind="article" titleKey="nav.articles" contentLocale={params.locale ?? null} focusKey={params.key ?? null} trash={params.trash === '1'} />;
}
