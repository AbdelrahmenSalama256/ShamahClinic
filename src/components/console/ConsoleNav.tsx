'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  BadgePercent,
  CircleHelp,
  FileText,
  GalleryHorizontal,
  Images,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageCircleHeart,
  Newspaper,
  Search,
  Signpost,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Type,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem } from '@/lib/console/screens';
import { consoleCall } from './client-api';

/**
 * One flat list of destinations — the sidebar's column and the phone's tab bar.
 *
 * There are no folds, no carets and no entity leaves: a screen a role may read is one
 * link, and a named list ("Services", "Result stories") is a screen of its own rather
 * than a leaf under "Lists". The order comes from `navItems`, which reads the grants, so
 * what a role may read decides which rows exist and what it may write decides which are
 * greyed.
 *
 * Rendered by `ConsoleFrame` twice — the sidebar and the sticky phone strip — and CSS
 * shows exactly one at any width, so only one nav landmark is ever in the accessibility
 * tree or the tab order.
 */
/**
 * A glyph beside each row, so a person scanning twenty links finds "Leads" by its shape
 * before reading. The row's words stay the name; the icon is decoration (`aria-hidden`).
 * A key with no glyph here (a list added later) simply draws its words alone.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  overview: LayoutDashboard,
  leads: Inbox,
  articles: Newspaper,
  offers: BadgePercent,
  pages: FileText,
  about: Info,
  hero: GalleryHorizontal,
  nav: Menu,
  branches: MapPin,
  specialists: Stethoscope,
  services: Sparkles,
  faq: CircleHelp,
  results: Images,
  testimonials: MessageCircleHeart,
  texts: Type,
  seo: Search,
  redirects: Signpost,
  tracking: Activity,
  roles: ShieldCheck,
  users: Users,
  settings: Settings,
  password: KeyRound,
};

export function ConsoleNav({
  items,
  labels,
  variant = 'side',
}: Readonly<{
  items: readonly NavItem[];
  labels: { screens: string; readOnly: string; signOut: string };
  variant?: 'side' | 'strip';
}>) {
  const pathname = usePathname();
  // `/console` is a prefix of every address, so it is the one row that must match exactly.
  const current = (path: string): boolean =>
    path === '/console' ? pathname === '/console' : pathname === path || pathname.startsWith(`${path}/`);

  return (
    <nav className={variant === 'strip' ? 'console-nav console-nav-strip' : 'console-nav'} aria-label={labels.screens}>
      <ul className="console-nav-list">
        {items.map((item) => {
          const Icon = ICONS[item.key];
          return (
            <li key={item.key}>
              <Link
                href={item.path}
                className="console-nav-link"
                aria-current={current(item.path) ? 'page' : undefined}
                aria-disabled={item.writable ? undefined : true}
                title={item.writable ? undefined : labels.readOnly}
                data-locked={item.writable ? undefined : 'true'}
              >
                {Icon && <Icon className="console-nav-icon" size={17} strokeWidth={1.8} aria-hidden />}
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <SignOut label={labels.signOut} />
        </li>
      </ul>
    </nav>
  );
}

/**
 * The last row. Signing out is a `DELETE` with the session cookie, not a link: a GET a
 * browser could prefetch would end the session when the row scrolled into view.
 */
function SignOut({ label }: Readonly<{ label: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    setBusy(true);
    await consoleCall('/api/console/auth', 'DELETE');
    // The cookies are already gone, so the login page renders without a session;
    // a client navigation keeps the SPA alive instead of reloading the world.
    router.replace('/console/login');
  }

  return (
    <button type="button" className="console-nav-link console-nav-signout" disabled={busy} onClick={() => void signOut()}>
      <LogOut className="console-nav-icon" size={17} strokeWidth={1.8} aria-hidden />
      {label}
    </button>
  );
}
