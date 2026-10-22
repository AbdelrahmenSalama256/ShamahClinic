'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  key: string;
  path: string;
  label: string;
}

/** `aria-current` is the only reason this needs the browser URL. */
export function ConsoleNav({ items }: Readonly<{ items: NavItem[] }>) {
  const pathname = usePathname();
  return (
    <nav className="console-nav" aria-label="console">
      {items.map((item) => (
        <Link key={item.key} href={item.path} aria-current={pathname === item.path ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
