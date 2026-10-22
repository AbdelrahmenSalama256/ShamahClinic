import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
  /** `?trash=1` opens the Trash instead of the live rows, so the screen is linkable. */
  searchParams: Promise<{ trash?: string }>;
}

export default async function ConsoleArticlesPage({ searchParams }: Props) {
  return <ContentScreen kind="article" titleKey="nav.articles" trash={(await searchParams).trash === '1'} />;
}
