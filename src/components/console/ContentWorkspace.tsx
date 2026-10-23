'use client';

/**
 * One workspace for every content kind: the shared list on the left, the editor on the
 * right, and nothing else.
 *
 * The split is deliberate. This component owns the things the address bar already names —
 * which row is open, which list or language tab is showing, whether the Trash is being
 * browsed — because the list, the tabs and the next write all read the same scope, and two
 * copies of it would drift. `ConsoleEditor` owns the session for the row it holds: the
 * form, the autosave, the field messages, the preview.
 *
 * They meet at one gate. Anything that would throw away unsaved words — picking another
 * row, switching a tab, trashing, closing — goes through `requestNav()`. When the editor
 * says the form is clean the action runs immediately; when it says otherwise the action is
 * held here and the editor shows its save / discard / keep-editing panel, because only the
 * pane that holds the words can decide what happens to them.
 */
import { useCallback, useState } from 'react';
import { ConsoleEditor } from './ConsoleEditor';
import { ConsoleList } from './ConsoleList';
import { consoleCall } from './client-api';
import type { ContentScreenData, ContentScope } from '@/lib/console/content-screen';
import type { ContentLocale } from '@/lib/content/kinds';
import type { ListScope } from '@/lib/content/list-view';
import type { ContentRow } from '@/lib/content/store';
import type { MessageKey } from '@/lib/console/messages';

export function ContentWorkspace({ data }: Readonly<{ data: ContentScreenData }>) {
  const { labels, kind, scopeKind } = data;
  const api = `/api/console/content/${kind}`;
  const named = scopeKind === 'lists';

  const [scope, setScope] = useState<ListScope>({
    listKey: data.listKey,
    locale: data.activeLocale,
    trash: data.trash,
    focusKey: data.focusKey,
  });
  // `?key=` was resolved to an id by the server: the row it names may well be on page
  // four of a list this page does not hold.
  const [selectedId, setSelectedId] = useState<string | null>(data.focusId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; key: MessageKey } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [refresh, setRefresh] = useState(0);
  /** The editor's answer to `is the form dirty?`, kept here only so the gate can read it
      without reaching into the pane. */
  const [dirty, setDirty] = useState(false);
  /** The navigation the editor has not been allowed to run yet. */
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  const locale: ContentLocale = scope.locale === 'en' ? 'en' : 'ar';

  /** The scope a write names for this row: the language tab, or the list it belongs to. */
  const scopeValue: ContentScope = named ? String(scope.listKey ?? '') : locale;
  const publishable = data.abilities.publish.filter((candidate) => !named || candidate === scope.listKey);

  function query(): string {
    return named ? `?list=${encodeURIComponent(String(scope.listKey ?? ''))}` : `?locale=${locale}`;
  }

  const reloadList = useCallback(() => setRefresh((current) => current + 1), []);
  const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);
  const cancelPending = useCallback(() => setPending(null), []);

  /** The held navigation runs outside the state update: a thunk that moves twice is a
      row that was picked twice, and React may call this updater more than once. */
  const resolvePending = useCallback(() => {
    const nav = pending;
    setPending(null);
    nav?.run();
  }, [pending]);

  /** The gate: clean means go now, dirty means hold the thunk and let the editor ask. */
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

  const closeRow = useCallback(() => setSelectedId(null), []);

  function tell(result: { status: number; error: string | null }, ok: MessageKey): void {
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'error', key: labels[mapped] ? mapped : 'content.error.save' });
      return;
    }
    setNotice({ tone: 'ok', key: ok });
  }

  async function create(): Promise<void> {
    const key = newKey.trim();
    if (!key || !data.abilities.create.includes(scopeValue)) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}${query()}`, 'POST', { key });
    setBusy(false);
    const created = result.data?.row;
    if (created) {
      setCreating(false);
      setNewKey('');
      // A new row is empty, so there are no words to protect — the gate opens onto it.
      setPending(null);
      setSelectedId(created.id);
      setNotice({ tone: 'ok', key: 'content.saved' });
      reloadList();
      return;
    }
    tell(result, 'content.saved');
  }

  /** A bilingual row edits one locale at a time, so the tab is the scope of the next write. */
  const switchScope = useCallback(
    (patch: Partial<ListScope>): void => {
      setScope((current) => ({ ...current, ...patch }));
      setSelectedId(null);
      setNotice(null);
    },
    [],
  );

  /** A row the list published or trashed must not stay open in the editor. The list has
      already re-read itself, so this only clears the selection. */
  function dropIfMutated(ids: string[]): void {
    setSelectedId((current) => (current && ids.includes(current) ? null : current));
  }

  // `data-open` is the CSS cue that the editor has something in it. While it is empty the
  // list gets the wider column — a table of titles deserves the room, and the only thing
  // the other pane holds is the scope tabs.
  return (
    <div className="console-work" data-kind={kind} data-open={selectedId ? 'true' : undefined}>
      <section className="console-work-list" aria-label={labels['content.rows']}>
        <div className="console-controls console-work-bar">
          <button type="button" className="console-button" onClick={() => requestNav(() => switchScope({ trash: !scope.trash }))} aria-pressed={scope.trash}>
            {scope.trash ? labels['content.live'] : labels['content.trash']}
          </button>
          {data.abilities.create.includes(scopeValue) && !scope.trash && (
            <button type="button" className="console-button" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
              {labels['content.new']}
            </button>
          )}
        </div>

        {creating && (
          <form
            className="console-panel"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="console-field">
              <label htmlFor="new-key">{labels[`content.${data.keyColumn}` as MessageKey]}</label>
              <input id="new-key" value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={labels['content.identity_hint']} />
            </div>
            <div className="console-controls">
              <button type="submit" className="console-button console-button-primary" disabled={busy || newKey.trim() === ''}>
                {labels['content.create']}
              </button>
              <button type="button" className="console-button" onClick={() => setCreating(false)}>
                {labels['content.cancel']}
              </button>
            </div>
          </form>
        )}

        <ConsoleList
          kind={kind}
          scope={scope}
          page={data.page}
          view={data.view}
          sorts={data.sorts}
          filters={data.filters}
          locale={locale}
          labels={labels}
          abilities={data.abilities}
          selectedId={selectedId}
          onSelect={(candidate) => requestNav(() => setSelectedId(candidate?.id ?? null))}
          onScopeChange={(next) => requestNav(() => switchScope(next))}
          onMutated={dropIfMutated}
          refreshToken={refresh}
        />
      </section>

      <section className="console-work-edit" aria-label={labels['content.editor']}>
        {/* A list screen switches lists, so its tabs are the only way to reach a list
            whose rows are not on screen — they have to survive an empty selection. */}
        {(named || selectedId !== null) && (
          <div className="console-tabs" role="tablist" aria-label={labels[named ? 'content.list.pick' : 'content.language']}>
            {data.scopes.map((candidate) => (
              <button
                key={String(candidate)}
                type="button"
                role="tab"
                aria-selected={String(candidate) === String(scopeValue)}
                className="console-button"
                data-active={String(candidate) === String(scopeValue) || undefined}
                onClick={() =>
                  requestNav(() =>
                    named ? switchScope({ listKey: String(candidate) }) : switchScope({ locale: candidate as ContentLocale }),
                  )
                }
              >
                {named ? (data.lists.find((list) => list.key === candidate)?.label ?? String(candidate)) : labels[`content.locale.${candidate}` as MessageKey]}
              </button>
            ))}
          </div>
        )}

        <ConsoleEditor
          kind={kind}
          api={api}
          scopeValue={scopeValue}
          named={named}
          locale={locale}
          rowId={selectedId}
          labels={labels}
          abilities={data.abilities}
          publishable={publishable}
          pendingNav={pending !== null}
          onRequestNav={requestNav}
          onPendingResolve={resolvePending}
          onPendingCancel={cancelPending}
          onDirtyChange={onDirtyChange}
          onChanged={reloadList}
          onClose={closeRow}
        />

        {notice && (
          <p className="console-alert" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {labels[notice.key]}
          </p>
        )}
      </section>
    </div>
  );
}
