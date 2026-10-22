'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { NavBranch, NavGroup } from '@/lib/console/screens';

/**
 * The sidebar's tree: group → screen → entity, straight off the grant catalog.
 *
 * The fold is a native `<details>` rather than React state for the same reason the
 * drawer's toggle is a link: with JavaScript switched off the leaves still open, and
 * the console's rule since BK-5 is that navigation does not need script. The branch's
 * own link stops the toggle from firing, because navigating and folding are two
 * different intentions on one row.
 *
 * Rendered by `ConsoleFrame` twice as a tree (sidebar and drawer) and once as the flat
 * phone strip, and CSS shows exactly one of them at any width, so only one nav landmark
 * is ever in the accessibility tree or the tab order.
 */
export function ConsoleNavTree({
  groups,
  labels,
}: Readonly<{
  groups: NavGroup[];
  labels: { screens: string; readOnly: string };
}>) {
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const href = search ? `${pathname}?${search}` : pathname;

  const leaf = (branch: NavBranch) => (
    <Link
      href={branch.path}
      className="console-nav-link"
      aria-current={href === branch.path ? 'page' : undefined}
      aria-disabled={branch.writable ? undefined : true}
      title={branch.writable ? undefined : labels.readOnly}
      data-locked={branch.writable ? undefined : 'true'}
      onClick={(event) => event.stopPropagation()}
    >
      {branch.label}
    </Link>
  );

  return (
    <nav className="console-nav console-nav-tree" aria-label={labels.screens}>
      {groups.map((group) => (
        <div className="console-nav-group" key={group.key}>
          <p className="console-nav-heading">{group.label}</p>
          <ul className="console-nav-list">
            {group.branches.map((branch) =>
              branch.leaves.length === 0 ? (
                <li className="console-nav-flat" key={branch.key}>
                  {leaf(branch)}
                </li>
              ) : (
                <li className="console-nav-branch" key={branch.key}>
                  <details open={href === branch.path || branch.leaves.some((candidate) => candidate.path === href) || undefined}>
                    <summary className="console-nav-head">
                      {leaf(branch)}
                      <span className="console-nav-caret" aria-hidden="true" />
                    </summary>
                    <ul className="console-nav-leaves">
                      {branch.leaves.map((candidate) => (
                        <li key={candidate.key}>
                          <Link
                            href={candidate.path}
                            className="console-nav-leaf"
                            aria-current={href === candidate.path ? 'page' : undefined}
                            aria-disabled={candidate.writable ? undefined : true}
                            title={candidate.writable ? undefined : labels.readOnly}
                            data-locked={candidate.writable ? undefined : 'true'}
                          >
                            {candidate.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ),
            )}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The phone tab bar: the same screens, flat, because a 640 px strip holds no tree. */
export function ConsoleNavStrip({
  items,
  labels,
}: Readonly<{
  items: readonly NavBranch[];
  labels: { screens: string; readOnly: string };
}>) {
  const pathname = usePathname();
  return (
    <nav className="console-nav console-nav-strip" aria-label={labels.screens}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.path}
          aria-current={pathname === item.path ? 'page' : undefined}
          aria-disabled={item.writable ? undefined : true}
          title={item.writable ? undefined : labels.readOnly}
          data-locked={item.writable ? undefined : 'true'}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
