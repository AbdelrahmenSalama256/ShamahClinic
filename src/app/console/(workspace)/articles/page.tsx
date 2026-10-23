import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
/** The URL names the view: `?sort=`, `?q=`, `?filter=` and the scope (`?locale=`, `?key=`, `?trash=1`). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleArticlesPage({ searchParams }: Props) {
  return <ContentScreen kind="article" titleKey="nav.articles" search={await searchParams} />;
}
