'use client';

/** The SEO screen's two views — every page's result, and the site-wide switches — as links. */
import { useRouter } from 'next/navigation';
import { Tabs } from './kit-tabs';
import type { MessageKey } from '@/lib/console/messages';

export function SeoViewTabs({ value, labels }: Readonly<{ value: 'pages' | 'settings'; labels: Record<MessageKey, string> }>) {
  const router = useRouter();
  return (
    <Tabs
      items={[
        { id: 'pages', label: labels['seo.view.pages'] },
        { id: 'settings', label: labels['seo.view.settings'] },
      ]}
      value={value}
      onChange={(next) => router.push(next === 'settings' ? '/console/seo?view=settings' : '/console/seo')}
      label={labels['nav.seo']}
      idBase="seo-view"
      className="console-tabs console-seo-view"
    />
  );
}
