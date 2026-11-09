'use client';

/**
 * The count of new leads beside "Leads" in the sidebar, so a lead that arrives while
 * someone edits an article is seen without opening the inbox. It reads the same list
 * endpoint the inbox does — one row, just the per-status counts, already limited to the
 * sources this account may read — on load, on every screen change, and once a minute.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { consoleRead } from './client-api';

const EVERY_MS = 60_000;

export function LeadsBadge({ label }: Readonly<{ label: string }>) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      if (document.visibilityState === 'hidden') return;
      const result = await consoleRead<{ counts?: { new?: number } }>('/api/console/leads?per=1');
      if (alive && result.data?.counts) setCount(Number(result.data.counts.new ?? 0));
    };
    void read();
    const timer = window.setInterval(() => void read(), EVERY_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  if (count <= 0) return null;
  return (
    <span className="console-nav-badge" aria-label={label.replace('{n}', String(count))}>
      {count > 99 ? '99+' : count}
    </span>
  );
}
