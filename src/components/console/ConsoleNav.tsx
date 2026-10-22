'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  key: string;
  path: string;
  label: string;
}

/**
 * `aria-current` is the only reason this needs the browser URL.
 *
 * Rendered twice by `ConsoleFrame` — once as the sidebar/drawer list, once as the
 * phone tab bar — and CSS shows exactly one of the two at any width, so only one nav
 * landmark is ever in the accessibility tree or the tab order.
 */
export function ConsoleNav({
  items,
  label,
  strip = false,
}: Readonly<{ items: NavItem[]; label: string; strip?: boolean }>) {
  const pathname = usePathname();
  return (
    <nav className={strip ? 'console-nav console-nav-strip' : 'console-nav'} aria-label={label}>
      {items.map((item) => (
        <Link key={item.key} href={item.path} aria-current={pathname === item.path ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
