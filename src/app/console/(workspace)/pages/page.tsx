import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
/** The URL names the view: `?sort=`, `?q=`, `?filter=` and the scope (`?locale=`, `?key=`, `?trash=1`). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleSitePagesPage({ searchParams }: Props) {
  return <ContentScreen kind="page" titleKey="nav.pages" search={await searchParams} />;
}
