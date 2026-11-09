'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { NavItem, PalettePlace } from '@/lib/console/screens';
import { ConsoleNav } from './ConsoleNav';
import { ConsolePalette, type PaletteLabels } from './ConsolePalette';

/**
 * The frame's interactive half: which way the navigation is reachable at this width.
 *
 * Three shapes, all decided in CSS (`console.css`), and this component only ever adds
 * `data-nav="open"` to the frame:
 *   ≥ 1024px  the sidebar is a column, the toggle is hidden
 *   < 1024px  the sidebar is an off-canvas drawer, opened by the toggle
 *   <  640px  the same screens are mirrored into a sticky tab bar, so a phone never has
 *             to open anything to change screen
 *
 * The tree is rendered twice (sidebar column and drawer) and the strip once, and CSS
 * shows exactly one of the three at any width, so only one nav landmark is ever in the
 * accessibility tree.
 *
 * The toggle is an `<a href="#console-side">` rather than a button on purpose: the
 * drawer also opens on `:target`, so it works with JavaScript switched off — the
 * console's rule since BK-5 that chrome is server-decided. When the browser does have
 * script, the click is intercepted and the state moves to `data-nav`, and closing
 * clears the hash, because a hash left pointing at the drawer would outrank "closed".
 */
export function ConsoleFrame({
  items,
  places,
  labels,
  brand,
  controls,
  account,
  children,
}: Readonly<{
  items: NavItem[];
  places: PalettePlace[];
  labels: {
    screens: string;
    close: string;
    readOnly: string;
    signOut: string;
    newLeads?: string;
    palette: PaletteLabels;
  };
  brand: React.ReactNode;
  controls: React.ReactNode;
  account: React.ReactNode;
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sideRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLAnchorElement>(null);

  // The URL the drawer was opened on — the query too, because a nav leaf is a query
  // change (`?locale=ar`), and a drawer that stays open after it lands on the same
  // pathname would cover the content the click just asked for. Kept with the state so
  // navigating closes the drawer by itself: an effect that reset `open` on every path
  // change would be a cascade React has to render twice, and React's lint says so.
  const location = params.size > 0 ? `${pathname}?${params.toString()}` : pathname;
  const [drawer, setDrawer] = useState<{ open: boolean; at: string }>({ open: false, at: '' });
  const open = drawer.open && drawer.at === location;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setDrawer((current) => ({ ...current, open: false }));
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    sideRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const dismissHash = (): void => {
    if (window.location.hash === '#console-side') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  const close = (): void => {
    setDrawer((current) => ({ ...current, open: false }));
    dismissHash();
    // Whoever is holding the drawer's own link or button already moves focus explicitly;
    // this is the scrim, where nothing does. A focus left inside a subtree that has just
    // gone `visibility: hidden` is dropped to the body, and the keyboard user loses their
    // place in the page. Measured: after a scrim tap `activeElement` was `#console-side`.
    if (sideRef.current?.contains(document.activeElement)) toggleRef.current?.focus();
  };

  const navLabels = { screens: labels.screens, readOnly: labels.readOnly, signOut: labels.signOut, newLeads: labels.newLeads };

  return (
    <div className="console-frame" data-nav={open ? 'open' : 'closed'}>
      <div className="console-topbar">
        <header className="console-header">
          <a
            ref={toggleRef}
            className="console-toggle"
            href="#console-side"
            aria-controls="console-side"
            aria-expanded={open}
            onClick={(event) => {
              event.preventDefault();
              setDrawer({ open: !open, at: location });
              dismissHash();
            }}
          >
            <span className="console-toggle-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </span>
            {labels.screens}
          </a>
          {brand}
          <ConsolePalette entries={places} labels={labels.palette} />
          {controls}
        </header>
        <ConsoleNav items={items} labels={navLabels} variant="strip" />
      </div>

      <aside ref={sideRef} id="console-side" className="console-side" tabIndex={-1}>
        <div className="console-side-head">
          <p className="console-side-heading">{labels.screens}</p>
          <a
            className="console-side-close"
            href="#console-main"
            onClick={(event) => {
              event.preventDefault();
              close();
              toggleRef.current?.focus();
            }}
          >
            {labels.close}
          </a>
        </div>
        <ConsoleNav items={items} labels={navLabels} />
        {account}
      </aside>

      <a
        className="console-scrim"
        href="#console-main"
        aria-hidden="true"
        tabIndex={-1}
        onClick={(event) => {
          event.preventDefault();
          close();
        }}
      />

      <main id="console-main" className="console-main">
        <div className="console-content">{children}</div>
      </main>
    </div>
  );
}
