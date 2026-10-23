'use client';

/**
 * One workspace for every content kind: the shared list on the left, the editor on the
 * right, and the four lifecycle actions (save, publish, Trash, history) under the fields.
 *
 * It is a client component because the editing session is one — typing, switching a
 * language tab, pressing publish — while every fact in it comes from the server: the
 * first page of rows arrives rendered, and each call answers with the row as the database
 * now holds it, which is what gets shown afterwards. Nothing is trusted from the form:
 * `?locale=` and `?list=` name the scope the guard checks, and the draft/published split
 * stays in `src/lib/content`.
 *
 * The list and the editor hold different shapes on purpose. The list is a page of
 * summaries — a title, a state, a date — because that is all a row needs to be picked.
 * The editor is one whole document, fetched by id when a row is chosen, because a body
 * belongs in the address bar of one row and not in 25 list cells.
 */
import { useCallback, useEffect, useState } from 'react';
import { ConsoleList } from './ConsoleList';
import { consoleCall, consoleRead } from './client-api';
import type { ContentScreenData, ContentScope } from '@/lib/console/content-screen';
import type { ContentLocale } from '@/lib/content/kinds';
import type { ListScope } from '@/lib/content/list-view';
import type { ContentRow, FieldView } from '@/lib/content/store';
import type { RevisionView } from '@/lib/content/publish';
import type { MessageKey } from '@/lib/console/messages';

type Form = Record<string, string | boolean>;

/** The row's state, as one chip. `pending` is the draft having outrun the published copy. */
function stateKey(row: ContentRow): MessageKey {
  if (row.trashed) return 'content.state.trashed';
  // A row nobody has ever published has no unpublished changes: it is a draft.
  if (row.publishedAt && row.pendingLocales.length > 0) return 'content.state.pending';
  return row.status === 'draft' ? 'content.state.draft' : 'content.state.published';
}

/** Pending in one language only: an Arabic edit must not flag the English tab. */
function isPendingIn(field: FieldView, locale: ContentLocale): boolean {
  const published = field.pub?.[locale];
  return published !== null && published !== undefined && field.draft?.[locale] !== published;
}

function formOf(row: ContentRow, locale: ContentLocale): Form {
  const out: Form = {};
  for (const [name, field] of Object.entries(row.fields)) {
    if (field.kind === 'bi') out[name] = field.draft?.[locale] ?? '';
    else if (field.kind === 'json') out[name] = JSON.stringify(field.draftJson ?? {}, null, 2);
    else if (field.kind === 'flag') out[name] = Boolean(field.value);
    else out[name] = field.value === null || field.value === undefined ? '' : String(field.value);
  }
  return out;
}

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
  /** The document, tagged with the row it was read for: a reply to the row someone
      switched away from must not draw over the one they are now on. */
  const [doc, setDoc] = useState<{ forId: string; row: ContentRow | null } | null>(null);
  const [docNonce, setDocNonce] = useState(0);
  const row = selectedId !== null && doc?.forId === selectedId ? doc.row : null;
  const loadingRow = selectedId !== null && doc?.forId !== selectedId;
  const [form, setForm] = useState<Form>({});
  const [formKey, setFormKey] = useState('');
  const [history, setHistory] = useState<{ id: string; revisions: RevisionView[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; key: MessageKey } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [refresh, setRefresh] = useState(0);

  const locale: ContentLocale = scope.locale === 'en' ? 'en' : 'ar';

  /** The scope a write names for this row: the language tab, or the list it belongs to. */
  const scopeValue: ContentScope = named ? String(scope.listKey ?? '') : locale;
  const writable = data.abilities.update.includes(scopeValue);
  const publishable = data.abilities.publish.filter((candidate) => !named || candidate === scope.listKey);

  /** The scope a write names: a bilingual row names its language tab, a list item its list. */
  function query(): string {
    return named ? `?list=${encodeURIComponent(String(scope.listKey ?? ''))}` : `?locale=${locale}`;
  }

  const reloadList = useCallback(() => setRefresh((current) => current + 1), []);

  // The whole document is read only once a row is chosen — and never in bulk.
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void (async () => {
      const result = await consoleRead<{ row?: ContentRow }>(`${api}/${selectedId}`);
      if (!alive) return;
      setDoc({ forId: selectedId, row: result.data?.row ?? null });
      if (!result.data?.row) setNotice({ tone: 'error', key: 'content.error.not_found' });
    })();
    return () => {
      alive = false;
    };
  }, [api, selectedId, docNonce]);

  function tell(result: { status: number; error: string | null }, ok: MessageKey): void {
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'error', key: labels[mapped] ? mapped : 'content.error.save' });
      return;
    }
    setNotice({ tone: 'ok', key: ok });
  }

  // The form belongs to one (row, language tab) pair. Switching either one resets
  // it, which React wants done during the render that noticed the change rather
  // than in an effect that renders the stale form once more first.
  const editing = `${row?.id ?? ''}.${locale}`;
  if (row && formKey !== editing) {
    setFormKey(editing);
    setForm(formOf(row, locale));
  }

  function fieldsFromRow(current: ContentRow): Record<string, unknown> | null {
    const fields: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(current.fields)) {
      const value = form[name];
      if (field.kind === 'flag') fields[name] = Boolean(value);
      else if (field.kind === 'number') {
        const text = String(value ?? '').trim();
        if (text === '') fields[name] = null;
        else {
          const parsed = Number(text);
          if (!Number.isFinite(parsed)) return null;
          fields[name] = parsed;
        }
      } else if (field.kind === 'json') {
        const text = String(value ?? '').trim();
        if (text === '') fields[name] = {};
        else {
          try {
            const parsed: unknown = JSON.parse(text);
            if (parsed === null || typeof parsed !== 'object') return null;
            fields[name] = parsed;
          } catch {
            return null;
          }
        }
      } else fields[name] = String(value ?? '');
    }
    return fields;
  }

  async function save(): Promise<void> {
    if (!row) return;
    const fields = fieldsFromRow(row);
    if (!fields) {
      setNotice({ tone: 'error', key: 'content.error.json' });
      return;
    }
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}${query()}`, 'PATCH', {
      fields,
      version: row.version,
    });
    setBusy(false);
    tell(result, 'content.saved');
    // The row the database now holds is what the editor shows next, version and all.
    if (result.data?.row) setDoc({ forId: row.id, row: result.data.row });
    reloadList();
  }

  async function publish(): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}/publish${query()}`, 'POST', {
      locales: named ? undefined : publishable,
    });
    setBusy(false);
    tell(result, 'content.published');
    if (result.data?.row) setDoc({ forId: row.id, row: result.data.row });
    reloadList();
  }

  async function moveToTrash(current: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleCall(`${api}/${current.id}${query()}`, 'DELETE', { trashed: true });
    setBusy(false);
    tell(result, 'content.trashed');
    setSelectedId(null);
    reloadList();
  }

  async function restore(current: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleCall(`${api}/${current.id}/restore${query()}`, 'POST', {});
    setBusy(false);
    tell(result, 'content.restored');
    setSelectedId(null);
    reloadList();
  }

  async function openHistory(current: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleRead<{ revisions?: RevisionView[] }>(`${api}/${current.id}/revisions${query()}`);
    setBusy(false);
    setHistory({ id: current.id, revisions: result.data?.revisions ?? [] });
    if (!result.data?.revisions) setNotice({ tone: 'error', key: 'content.load_failed' });
  }

  async function rollback(revision: number): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleCall(`${api}/${row.id}/rollback${query()}`, 'POST', { revision });
    setBusy(false);
    tell(result, 'content.rolled_back');
    // The row is already the open one, so asking for it again is what shows the rollback.
    setDocNonce((current) => current + 1);
    reloadList();
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
      setSelectedId(created.id);
      setNotice({ tone: 'ok', key: 'content.saved' });
      reloadList();
      return;
    }
    tell(result, 'content.saved');
  }

  /** A bilingual row edits one locale at a time, so the tab is the scope of the next write. */
  function switchScope(patch: Partial<ListScope>): void {
    setScope((current) => ({ ...current, ...patch }));
    setSelectedId(null);
    setNotice(null);
  }

  function pickList(next: string): void {
    switchScope({ listKey: next });
  }

  function toggleTrash(): void {
    switchScope({ trash: !scope.trash });
  }

  /** A row the list published or trashed must not stay open in the editor. The list has
      already re-read itself, so this only clears the selection. */
  function dropIfMutated(ids: string[]): void {
    if (row && ids.includes(row.id)) setSelectedId(null);
  }

  const canEditRow = row !== null && writable && !row.trashed && !loadingRow;

  // `data-open` is the CSS cue that the editor has something in it. While it is empty the
  // list gets the wider column — a table of titles deserves the room, and the only thing
  // the other pane holds is the scope tabs.
  return (
    <div className="console-work" data-kind={kind} data-open={row ? 'true' : undefined}>
      <section className="console-work-list" aria-label={labels['content.rows']}>
        <div className="console-controls console-work-bar">
          <button type="button" className="console-button" onClick={toggleTrash} aria-pressed={scope.trash}>
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
          onSelect={(candidate) => setSelectedId(candidate?.id ?? null)}
          onScopeChange={switchScope}
          onMutated={dropIfMutated}
          refreshToken={refresh}
        />
      </section>

      <section className="console-work-edit">
        {/* A list screen switches lists, so its tabs are the only way to reach a list
            whose rows are not on screen — they have to survive an empty selection. */}
        {(named || row) && (
          <div className="console-tabs" role="tablist" aria-label={labels[named ? 'content.list.pick' : 'content.language']}>
            {data.scopes.map((candidate) => (
              <button
                key={String(candidate)}
                type="button"
                role="tab"
                aria-selected={String(candidate) === String(scopeValue)}
                className="console-button"
                data-active={String(candidate) === String(scopeValue) || undefined}
                onClick={() => (named ? pickList(String(candidate)) : switchScope({ locale: candidate as ContentLocale }))}
              >
                {named ? (data.lists.find((list) => list.key === candidate)?.label ?? String(candidate)) : labels[`content.locale.${candidate}` as MessageKey]}
              </button>
            ))}
          </div>
        )}

        {loadingRow && <p className="console-lede">{labels['content.loading']}</p>}

        {!row && !loadingRow ? (
          <p className="console-lede">{labels['content.pick_row']}</p>
        ) : row ? (
          <>
            <header className="console-work-head">
              <h2>{row.key}</h2>
              <span className="console-chip">{labels[stateKey(row)]}</span>
              <button type="button" className="console-button" onClick={() => setSelectedId(null)}>
                {labels['content.close']}
              </button>
              <span className="console-meta">
                {labels['content.version']} {row.version} ·{' '}
                {row.publishedAt ? `${labels['content.published_at']}: ${row.publishedAt.slice(0, 10)}` : labels['content.no_history']} ·{' '}
                {labels['content.updated_at']}: {row.updatedAt.slice(0, 10)}
              </span>
            </header>

            {row.trashed ? (
              <p className="console-alert" data-tone="error">
                {labels['content.state.trashed']}
              </p>
            ) : !writable ? (
              <p className="console-alert">{labels[data.abilities.update.length === 0 ? 'content.readonly' : 'content.locale_locked']}</p>
            ) : null}

            <div className="console-fields">
              {Object.entries(row.fields).map(([name, field]) => (
                <FieldRow
                  key={name}
                  name={name}
                  field={field}
                  locale={locale}
                  value={form[name]}
                  disabled={!canEditRow}
                  labels={labels}
                  onChange={(next) => setForm((current) => ({ ...current, [name]: next }))}
                />
              ))}
            </div>

            <div className="console-controls console-work-actions">
              <button type="button" className="console-button console-button-primary" onClick={() => void save()} disabled={busy || !canEditRow}>
                {labels['content.save']}
              </button>
              {publishable.length > 0 && !row.trashed && (
                <button type="button" className="console-button" onClick={() => void publish()} disabled={busy}>
                  {labels['content.publish']}
                </button>
              )}
              {data.abilities.remove.includes(scopeValue) && !row.trashed && (
                <button type="button" className="console-button" onClick={() => void moveToTrash(row)} disabled={busy}>
                  {labels['content.trash_item']}
                </button>
              )}
              {row.trashed && data.abilities.update.includes(scopeValue) && (
                <button type="button" className="console-button" onClick={() => void restore(row)} disabled={busy}>
                  {labels['content.restore']}
                </button>
              )}
              <button type="button" className="console-button" onClick={() => void openHistory(row)} disabled={busy}>
                {labels['content.history']}
              </button>
            </div>

            {history && history.id === row.id && (
              <div className="console-panel console-history">
                {history.revisions.length === 0 ? (
                  <p className="console-lede">{labels['content.no_history']}</p>
                ) : (
                  <ul className="console-rows">
                    {history.revisions.map((revision) => (
                      <li key={revision.id} className="console-revision">
                        <span>
                          #{revision.revision} · {revision.createdAt.slice(0, 16).replace('T', ' ')} · {revision.authorEmail}
                          {revision.note ? ` · ${revision.note}` : ''}
                        </span>
                        {publishable.length > 0 && (
                          <button type="button" className="console-button" onClick={() => void rollback(revision.revision)} disabled={busy}>
                            {labels['content.rollback']}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="console-button" onClick={() => setHistory(null)}>
                  {labels['content.close']}
                </button>
              </div>
            )}
          </>
        ) : null}

        {notice && (
          <p className="console-alert" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {labels[notice.key]}
          </p>
        )}
      </section>
    </div>
  );
}

function FieldRow({
  name,
  field,
  locale,
  value,
  disabled,
  labels,
  onChange,
}: Readonly<{
  name: string;
  field: FieldView;
  locale: ContentLocale;
  value: string | boolean | undefined;
  disabled: boolean;
  labels: Record<MessageKey, string>;
  onChange: (next: string | boolean) => void;
}>) {
  const label = labels[`content.field.${name}` as MessageKey] ?? name;
  const id = `field-${name}`;

  if (field.kind === 'flag') {
    return (
      <div className="console-field console-field-flag">
        <label htmlFor={id}>
          <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
          <span>{label}</span>
        </label>
        <span className="console-note">{labels['content.immediate']}</span>
      </div>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const pending = !disabled && (field.kind === 'bi' ? isPendingIn(field, locale) : field.pending);

  return (
    <div className="console-field">
      <label htmlFor={id}>
        {label}
        {field.kind === 'bi' ? <span className="console-field-locale">{labels[`content.locale.${locale}` as MessageKey]}</span> : null}
        {pending ? <span className="console-chip">{labels['content.state.pending']}</span> : null}
      </label>
      {field.multiline ? (
        <textarea id={id} rows={field.kind === 'bi' && name === 'content' ? 14 : 6} value={text} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input
          id={id}
          type={field.kind === 'number' ? 'number' : 'text'}
          value={text}
          disabled={disabled}
          maxLength={field.max > 0 && field.max < 100_000 ? field.max : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.immediate ? <span className="console-note">{labels['content.immediate']}</span> : null}
    </div>
  );
}
