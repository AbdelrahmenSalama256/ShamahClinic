import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ trash?: string }>;
}

export default async function ConsoleOffersPage({ searchParams }: Props) {
  return <ContentScreen kind="offer" titleKey="nav.offers" trash={(await searchParams).trash === '1'} />;
}
