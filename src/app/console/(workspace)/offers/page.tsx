import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
/** The URL names the view: `?sort=`, `?q=`, `?filter=` and the scope (`?locale=`, `?key=`, `?trash=1`). */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleOffersPage({ searchParams }: Props) {
  return <ContentScreen kind="offer" titleKey="nav.offers" search={await searchParams} />;
}
