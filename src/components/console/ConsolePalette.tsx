'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PalettePlace } from '@/lib/console/screens';
import type { SearchHit } from '@/lib/console/search';
import { consoleRead } from './client-api';
import { Button } from '@/components/console/kit';
import { Input } from '@/components/console/kit';
import { Badge, Note, Skeleton } from '@/components/console/kit';

export type PaletteLabels = {
  open: string;
  placeholder: string;
  screens: string;
  records: string;
  searching: string;
  empty: string;
  shortcut: string;
  readOnly: string;
};

const KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

/**
 * ⌘K / Ctrl+K over the places this role may open, plus the titled rows it may read.
 *
 * Two halves, because they answer two different questions. The sections are already
 * in the shell's own props — the same flat list the sidebar draws — so filtering them
 * is a keystroke with no request; the records need the database, so they arrive from
 * `/api/console/search` after a pause, and only for the kinds this caller holds `read` on.
 *
 * A `<dialog>` shown with `showModal()` gives the browser's own focus trap, Esc and
 * inert background for free. That also makes the palette the one piece of the console
 * that *does* need JavaScript: the nav and the drawer stay reachable without it, and
 * nothing you can reach here is unreachable there.
 */
export function ConsolePalette({ entries, labels }: Readonly<{ entries: PalettePlace[]; labels: PaletteLabels }>) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  // Which term the current hits belong to: `pending` is derived from it, so the
  // effect never has to set a "loading" flag around its own timeout.
  const [found, setFound] = useState<{ for: string; hits: SearchHit[] }>({
    for: '',
    hits: [],
  });

  const needle = term.trim();
  const pending = needle.length >= 2 && found.for !== needle;

  const places = needle ? entries.filter((entry) => entry.label.toLowerCase().includes(needle.toLowerCase())) : entries;
  const hits = found.for === needle ? found.hits : [];
  const nothing = needle.length > 0 && places.length === 0 && !pending && hits.length === 0;

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (!dialog.current?.open || !KEYS.includes(event.key)) return;
      const links = [...(list.current?.querySelectorAll('a') ?? [])] as HTMLAnchorElement[];
      if (links.length === 0) return;
      const at = links.findIndex((link) => link === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : event.key === 'ArrowUp' ? (at <= 0 ? links.length - 1 : at - 1) : (at + 1) % links.length;
      event.preventDefault();
      links[next]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The `<dialog>` is the source of truth for whether it is open; `open` only mirrors
  // it, so Esc, a row click and ⌘K-while-open all close the same way. Closing returns
  // focus to the button that opened it, which the browser would otherwise drop on body.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      input.current?.focus();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    if (needle.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await consoleRead<{ hits?: SearchHit[] }>(`/api/console/search?q=${encodeURIComponent(needle)}`);
      setFound({ for: needle, hits: result.data?.hits ?? [] });
    }, 250);
    return () => clearTimeout(timer);
  }, [needle]);

  const go = (path: string): void => {
    close();
    setTerm('');
    router.push(path);
  };

  return (
    <>
      <Button ref={trigger} onClick={() => setOpen(true)}>
        {labels.open}
      </Button>
      <dialog
        ref={dialog}
        className="console-palette"
        onClose={() => {
          // Esc and a row click both land here: `open` follows the dialog, and focus goes
          // back to the button that opened it instead of the body.
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <form method="dialog" className="console-palette-form" onSubmit={(event) => event.preventDefault()}>
          <Input
            ref={input}
            className="console-palette-input"
            type="search"
            value={term}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
            autoComplete="off"
            onChange={(event) => setTerm(event.target.value)}
          />
          <p className="console-palette-hint">{labels.shortcut}</p>
        </form>
        <div ref={list} className="console-palette-list">
          {places.length > 0 && (
            <section>
              <h2 className="console-palette-section">{labels.screens}</h2>
              {places.map((entry) => (
                <a
                  key={entry.path}
                  href={entry.path}
                  className="console-palette-row"
                  data-locked={entry.writable ? undefined : 'true'}
                  title={entry.writable ? undefined : labels.readOnly}
                  onClick={(event) => {
                    event.preventDefault();
                    go(entry.path);
                  }}
                >
                  <span className="console-palette-label">{entry.label}</span>
                  {!entry.writable && <Badge>{labels.readOnly}</Badge>}
                </a>
              ))}
            </section>
          )}
          {(pending || hits.length > 0) && (
            <section>
              <h2 className="console-palette-section">{labels.records}</h2>
              {/* One well in the height of a result row, and the word inside it for the
                  voice — a `<p>` wearing the anchor's class could not be hovered anyway. */}
              {pending && <Skeleton rows={1} label={labels.searching} />}
              {hits.map((hit) => (
                <a
                  key={`${hit.kind}.${hit.id}`}
                  href={hit.path}
                  className="console-palette-row"
                  onClick={(event) => {
                    event.preventDefault();
                    go(hit.path);
                  }}
                >
                  <span className="console-palette-group">{hit.kind}</span>
                  <span className="console-palette-label">{hit.title}</span>
                </a>
              ))}
            </section>
          )}
          {nothing && <Note>{labels.empty}</Note>}
        </div>
      </dialog>
    </>
  );
}
