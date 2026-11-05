'use client';

/**
 * One row on its own page: the way back, the two language tabs, and the editor.
 *
 * The row is a URL now (`/console/<kind>/<id>`), so this component owns no selection: a
 * reload, a pasted link and the browser's Back button all land on the same screen. What
 * it does own is the one thing the address bar cannot express — a form with words in it
 * that have not been written yet. Every navigation (the back button, a language tab,
 * Escape) passes through `requestNav`, and a closed tab asks the browser first.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConsoleEditor } from './ConsoleEditor';
import { Button } from '@/components/console/kit';
import { Note } from '@/components/console/kit';
import { Tabs } from '@/components/console/kit-tabs';
import type { ContentDetailData } from '@/lib/console/content-screen';
import type { ContentLocale } from '@/lib/content/kinds';
import { writeScopeQuery } from '@/lib/content/list-view';
import type { MessageKey } from '@/lib/console/messages';

const LANGUAGE_TABS: ContentLocale[] = ['ar', 'en'];

export function ContentDetail({ data }: Readonly<{ data: ContentDetailData }>) {
  const { kind, row, labels } = data;
  const named = kind === 'list_item';
  const locale = data.activeLocale;
  const api = `/api/console/content/${kind}`;
  const router = useRouter();
  const pathname = usePathname();

  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const scopeValue = named ? String(data.listKey ?? '') : locale;

  const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);
  const cancelPending = useCallback(() => setPending(null), []);
  const reload = useCallback(() => router.refresh(), [router]);

  /** The held navigation runs outside the state update: React may call an updater twice. */
  const resolvePending = useCallback(() => {
    const nav = pending;
    setPending(null);
    nav?.run();
  }, [pending]);

  /** Clean means go now; dirty means hold the thunk and let the editor ask what to do. */
  const requestNav = useCallback(
    (run: () => void): void => {
      if (!dirty) {
        run();
        return;
      }
      setPending({ run });
    },
    [dirty],
  );

  const goBack = useCallback(() => router.push(data.backHref), [data.backHref, router]);
  const switchLocale = useCallback(
    (next: string) =>
      requestNav(() => router.push(`${pathname}${writeScopeQuery({ listKey: null, locale: next as ContentLocale })}`)),
    [pathname, requestNav, router],
  );

  // The browser's own leave — a closed tab, a typed address — has no panel to show, so the
  // only honest thing left is its generic "leave this page?" prompt.
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const tabs = LANGUAGE_TABS.map((candidate) => ({
    id: candidate,
    label: labels[`content.locale.${candidate}` as MessageKey],
  }));

  return (
    <div className="console-detail" data-kind={kind}>
      <div className="console-detail-head">
        <Button onClick={() => requestNav(goBack)}>{labels['content.back']}</Button>
        <div className="console-detail-id">
          <h1 className="console-heading">{data.title}</h1>
          <Note className="console-detail-key">{row.key}</Note>
        </div>
      </div>

      {/* A row with two languages is edited one at a time, and the tab is that choice.
          There is no dropdown anywhere: the tabs are always visible, so the language a
          write will name is never hidden behind a control. */}
      {!named && (
        <Tabs
          items={tabs}
          value={locale}
          onChange={switchLocale}
          label={labels['content.language']}
          idBase={`detail-${kind}-${row.id}`}
          className="console-tabs"
        />
      )}

      <ConsoleEditor
        kind={kind}
        api={api}
        scopeValue={scopeValue}
        named={named}
        locale={locale}
        rowId={row.id}
        initialRow={row}
        labels={labels}
        abilities={data.abilities}
        publishable={data.publishable}
        seo={data.seo}
        referenceOptions={data.referenceOptions}
        pendingNav={pending !== null}
        onRequestNav={requestNav}
        onPendingResolve={resolvePending}
        onPendingCancel={cancelPending}
        onDirtyChange={onDirtyChange}
        onChanged={reload}
        onClose={goBack}
      />
    </div>
  );
}
