import { ContentScreen } from '@/components/console/ContentScreen';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ trash?: string }>;
}

export default async function ConsoleSitePagesPage({ searchParams }: Props) {
  return <ContentScreen kind="page" titleKey="nav.pages" trash={(await searchParams).trash === '1'} />;
}
