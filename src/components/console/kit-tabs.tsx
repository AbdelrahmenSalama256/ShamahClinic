'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from './kit';

/**
 * Tabs, with the wiring a `role="tablist"` promises.
 *
 * Activation is manual — arrows move focus, Enter or Space selects — because selecting a
 * tab navigates: it rewrites the URL and asks the server for another page of rows.
 * Automatic activation would make holding Right-arrow down a request per step.
 *
 * The arrow mapping follows the *reading* direction, not the physical one: in Arabic the
 * first tab is on the right, so Right goes back. `document.dir` is read at the keypress,
 * because the console's own language switch flips it without reloading.
 */

export interface TabItem {
  id: string;
  label: ReactNode;
}

interface TabsShape {
  items: TabItem[];
  /** The selected id. Its tab is the only one `Tab` reaches, and the one arrows start from. */
  value: string;
  onChange: (id: string) => void;
  /** Names the group, the way `fieldset` names a set of radios. */
  label: string;
  /** Prefix for the tab and panel ids, so two tablists on one screen cannot collide. */
  idBase: string;
  className?: string;
  /** Omit it for a tablist that switches a view rather than owning a panel. */
  children?: ReactNode;
}

const ARROWS = ['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const;

export function Tabs({ items, value, onChange, label, idBase, className, children }: TabsShape) {
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tabId = (id: string) => `${idBase}-tab-${id}`;
  const panelId = `${idBase}-panel`;
  const hasPanel = children !== undefined && children !== null;

  function focusTab(index: number) {
    const target = items.at(index);
    if (target) tabs.current[target.id]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ARROWS.includes(event.key as (typeof ARROWS)[number])) return;
    const from = items.findIndex((item) => event.target === tabs.current[item.id]);
    if (from < 0) return;
    const forward = (event.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (from + (forward ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    focusTab(next);
  }

  return (
    <>
      <div role="tablist" aria-label={label} className={clsx('console-tabs', className)} onKeyDown={onKeyDown}>
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <Button
              key={item.id}
              id={tabId(item.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={hasPanel ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              active={selected}
              ref={(node) => {
                tabs.current[item.id] = node;
              }}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
      {hasPanel && (
        <div id={panelId} role="tabpanel" aria-labelledby={tabId(value)}>
          {children}
        </div>
      )}
    </>
  );
}
