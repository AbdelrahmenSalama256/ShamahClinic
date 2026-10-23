'use client';

/**
 * The list every content screen shares: one page of rows, drawn as a table or as cards,
 * with the search, the filter chips, the column orders, the page controls, the bulk
 * actions and the saved filters that change it.
 *
 * All of that state lives in the query string and nowhere else. The URL is the source of
 * truth because it is the only copy a colleague can be handed: a filter a person spent
 * ten minutes setting has to survive a refresh, a back button and a pasted link, and a
 * saved view is the same string with a name on it. `listViewQuery` writes it, the server
 * reads it back through `parseListView`, and the response's `page` is what this query
 * actually produced — so the screen never claims to be showing a filter the database
 * ignored.
 *
 * Two things it deliberately does not do. It never filters the rows it already has: 92
 * articles is a page of titles, not 92 article bodies pulled to the browser. And it draws
 * no control the kind cannot honour — `sorts` and `filters` come from the server, so an
 * article list shows no "Order" column and no "Off" chip.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { consoleCall, consoleRead } from './client-api';
import type { ContentAbilities } from '@/lib/console/content-screen';
import type { ContentKind, ContentLocale } from '@/lib/content/kinds';
import {
  LIST_PER_PAGES,
  listViewQuery,
  parseListView,
  withPage,
  withSort,
  withView,
  type ListFilter,
  type ListScope,
  type ListSort,
  type ListView,
} from '@/lib/content/list-view';
import type { ListPage, ListSummary } from '@/lib/content/summary';
import type { MessageKey } from '@/lib/console/messages';

interface SavedViewRow {
  id: string;
  name: string;
  query: string;
}

export interface ConsoleListProps {
  kind: ContentKind;
  /** the terms that decide which rows exist at all: the list, the language, the Trash */
  scope: ListScope;
  /** the page the server rendered, which is also this list's first state */
  page: ListPage;
  view: ListView;
  sorts: ListSort[];
  filters: ListFilter[];
  /** the language the titles are read in */
  locale: ContentLocale;
  labels: Record<MessageKey, string>;
  abilities: ContentAbilities;
  selectedId: string | null;
  onSelect: (row: ListSummary | null) => void;
  /** the scope chips and saved views change it; the parent owns it because the editor writes by it */
  onScopeChange: (scope: ListScope) => void;
  /** rows moved: the parent drops the editor's copy if it was one of them */
  onMutated: (ids: string[]) => void;
  /** bump it and the list re-reads the same view — how an editor save reaches the row's chip */
  refreshToken?: number;
}

/** The cells worth a column of their own; the rest are the kind's, printed by name. */
const SORT_KEYS: Record<ListSort, MessageKey> = {
  title: 'content.sort.title',
  key: 'content.sort.key',
  status: 'content.sort.status',
  updated: 'content.sort.updated',
  published: 'content.sort.published',
  position: 'content.sort.position',
};

const FILTER_KEYS: Record<ListFilter, MessageKey> = {
  all: 'content.filter.all',
  draft: 'content.filter.draft',
  published: 'content.filter.published',
  changed: 'content.filter.changed',
  pending: 'content.filter.pending',
  off: 'content.filter.off',
};

function titleOf(row: ListSummary, locale: ContentLocale): string {
  const other: ContentLocale = locale === 'ar' ? 'en' : 'ar';
  return (locale === 'ar' ? row.titleAr : row.titleEn) || (other === 'ar' ? row.titleAr : row.titleEn) || row.key;
}

/** One row's state, as one chip — the same four the editor prints. */
function stateOf(row: ListSummary): MessageKey {
  if (row.trashed) return 'content.state.trashed';
  // A row nobody has ever published has no unpublished changes: it is a draft.
  if (row.publishedAt && (row.pendingAr || row.pendingEn)) return 'content.state.pending';
  return row.status === 'published' || row.status === 'changed' ? 'content.state.published' : 'content.state.draft';
}

function cellText(value: string | number | boolean | null): string {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '●' : '○';
  return String(value);
}

export function ConsoleList({
  kind,
  scope,
  page: firstPage,
  view: firstView,
  sorts,
  filters,
  locale,
  labels,
  abilities,
  selectedId,
  onSelect,
  onScopeChange,
  onMutated,
  refreshToken = 0,
}: Readonly<ConsoleListProps>) {
  const [view, setView] = useState<ListView>(firstView);
  const [page, setPage] = useState<ListPage>(firstPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<MessageKey | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [term, setTerm] = useState(firstView.q);
  const [views, setViews] = useState<SavedViewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; key: MessageKey } | null>(null);

  // The URL is the state. Scope comes first so the line reads like the navigation.
  // `listViewQuery` returns the line with its own `?`, which is the only form that can
  // go into the address bar, onto the end of an API path, or into a saved view — so no
  // caller adds a second one.
  const query = useMemo(() => listViewQuery(view, scope, kind), [view, scope, kind]);
  const api = `/api/console/content/${kind}`;

  const load = useCallback(
    async (line: string): Promise<void> => {
      setLoading(true);
      setFailed(null);
      const result = await consoleRead<{ page?: ListPage }>(`${api}${line}`);
      setLoading(false);
      if (result.data?.page) {
        setPage(result.data.page);
        setChecked(new Set());
        return;
      }
      setFailed(result.error === 'forbidden' ? 'content.error.forbidden' : 'content.load_failed');
    },
    [api],
  );

  // The first page is the one the server just rendered for this exact URL, so the first
  // pass draws it and does not ask for it again. After that, a changed query — or a bump
  // from the editor — re-reads it and puts the same terms back in the address bar.
  const signature = `${query}#${refreshToken}`;
  const drawn = useRef(signature);
  useEffect(() => {
    if (drawn.current === signature) return;
    drawn.current = signature;
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
    void load(query);
  }, [signature, query, load]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await consoleRead<{ views?: SavedViewRow[] }>(`/api/console/views?kind=${kind}`);
      if (alive && result.data?.views) setViews(result.data.views);
    })();
    return () => {
      alive = false;
    };
  }, [kind]);

  // A search box that queried on every keystroke would run a LIKE over the table eight
  // times for one word.
  useEffect(() => {
    if (term === view.q) return;
    const timer = setTimeout(() => setView((current) => withView(current, { q: term })), 350);
    return () => clearTimeout(timer);
  }, [term, view.q]);

  // A wide table on a phone is not a table, so only the first three of a kind's own
  // columns get a cell; the rest reach the editor, where they are worth reading.
  const columns = useMemo(
    () => page.columns.filter((name) => name !== 'position' || !sorts.includes('position')).slice(0, 3),
    [page.columns, sorts],
  );
  const rows = page.rows;
  const allChecked = rows.length > 0 && rows.every((row) => checked.has(row.id));

  function toggleRow(id: string): void {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setChecked(allChecked ? new Set() : new Set(rows.map((row) => row.id)));
  }

  /** The scope a write names, in the term `guard()` reads it from. */
  function scopeParam(): string {
    return scope.listKey ? `list=${encodeURIComponent(scope.listKey)}` : `locale=${locale}`;
  }

  async function bulk(verb: 'publish' | 'trash' | 'restore'): Promise<void> {
    const ids = [...checked];
    if (ids.length === 0) return;
    setBusy(true);
    const result = await consoleCall<{ done?: string[]; failed?: { code: string }[] }>(`${api}/bulk/${verb}?${scopeParam()}`, 'POST', { ids });
    setBusy(false);
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'error', key: labels[mapped] ? mapped : 'content.error.save' });
    } else {
      const partial = (result.data?.failed?.length ?? 0) > 0;
      setNotice({ tone: partial ? 'error' : 'ok', key: partial ? 'content.bulk.partial' : 'content.bulk.done' });
      setChecked(new Set());
      await load(query);
      onMutated(ids);
    }
  }

  async function saveView(): Promise<void> {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    const result = await consoleCall<{ view?: SavedViewRow }>(`/api/console/views`, 'POST', { kind, name, query });
    setBusy(false);
    const mapped = result.error ? (`content.error.${result.error}` as MessageKey) : null;
    if (mapped && labels[mapped]) {
      setNotice({ tone: 'error', key: mapped });
      return;
    }
    // The chip only appears when the row comes back: a server that dies inside the
    // database answers with nothing at all, and "Filter saved." over a lost filter is
    // worse than the failure it hides.
    const saved = result.data?.view;
    if (!saved) {
      setNotice({ tone: 'error', key: 'content.error.save' });
      return;
    }
    setSaving(false);
    setNewName('');
    setNotice({ tone: 'ok', key: 'content.view.saved' });
    setViews((current) => [...current, { id: saved.id, name: saved.name, query: saved.query }]);
  }

  async function dropView(id: string): Promise<void> {
    const result = await consoleCall(`/api/console/views/${id}`, 'DELETE');
    if (result.error) {
      setNotice({ tone: 'error', key: 'content.error.save' });
      return;
    }
    setViews((current) => current.filter((row) => row.id !== id));
  }

  /** A saved view names a scope too, so applying it moves the tabs as well as the list. */
  function applyView(query: string): void {
    const params = new URLSearchParams(query.replace(/^\?/, ''));
    setView(parseListView(params, kind));
    setTerm((params.get('q') ?? '').trim());
    const list = (params.get('list') ?? '').trim();
    onScopeChange({
      listKey: kind === 'list_item' ? list || scope.listKey : scope.listKey,
      locale: params.get('locale') || scope.locale,
      trash: params.get('trash') === '1',
      focusKey: null,
    });
  }

  const bulkable = (verb: 'publish' | 'trash' | 'restore'): boolean => {
    const scopeKey: string = scope.listKey ?? locale;
    if (verb === 'publish') return abilities.publish.includes(scopeKey);
    return verb === 'trash' ? abilities.remove.includes(scopeKey) : abilities.update.includes(scopeKey);
  };

  return (
    <div className="console-list" data-mode={view.mode} aria-busy={loading}>
      <div className="console-list-bar">
        <div className="console-chips" role="group" aria-label={labels['content.filter.all']}>
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className="console-chip-button"
              data-active={view.filter === filter || undefined}
              aria-pressed={view.filter === filter}
              onClick={() => setView(withView(view, { filter }))}
            >
              {labels[FILTER_KEYS[filter]]}
            </button>
          ))}
        </div>

        <input
          className="console-search"
          type="search"
          value={term}
          placeholder={labels['content.search']}
          aria-label={labels['content.search']}
          onChange={(event) => setTerm(event.target.value)}
        />

        <div className="console-controls">
          <label className="console-inline">
            {labels['content.per_page']}
            <select
              value={String(view.per)}
              onChange={(event) => {
                const per = LIST_PER_PAGES.find((size) => String(size) === event.target.value) ?? 25;
                setView(withView(view, { per }));
              }}
            >
              {LIST_PER_PAGES.map((size) => (
                <option key={size} value={String(size)}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="console-button"
            aria-pressed={view.mode === 'card'}
            onClick={() => setView(withView(view, { mode: view.mode === 'table' ? 'card' : 'table' }))}
          >
            {labels[view.mode === 'table' ? 'content.mode.card' : 'content.mode.table']}
          </button>
          <button type="button" className="console-button" onClick={() => setSaving((open) => !open)} aria-expanded={saving}>
            {labels['content.view.save']}
          </button>
        </div>
      </div>

      {views.length > 0 && (
        <div className="console-views" role="group" aria-label={labels['content.views']}>
          {views.map((row) => (
            <span className="console-view-chip" key={row.id}>
              <button type="button" className="console-chip-button" onClick={() => applyView(row.query)}>
                {row.name}
              </button>
              <button type="button" className="console-chip-x" aria-label={`${labels['content.view.remove']}: ${row.name}`} onClick={() => void dropView(row.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {saving && (
        <form
          className="console-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void saveView();
          }}
        >
          <div className="console-field">
            <label htmlFor="view-name">{labels['content.view.name']}</label>
            <input id="view-name" value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} />
          </div>
          <div className="console-controls">
            <button type="submit" className="console-button console-button-primary" disabled={busy || newName.trim() === ''}>
              {labels['content.view.save']}
            </button>
            <button type="button" className="console-button" onClick={() => setSaving(false)}>
              {labels['content.cancel']}
            </button>
          </div>
        </form>
      )}

      {checked.size > 0 && (
        <div className="console-bulk" role="group" aria-label={labels['content.selected']}>
          <span className="console-count">
            {checked.size} {labels['content.selected']}
          </span>
          {bulkable('publish') && (
            <button type="button" className="console-button" disabled={busy} onClick={() => void bulk('publish')}>
              {labels['content.bulk.publish']}
            </button>
          )}
          {scope.trash
            ? bulkable('restore') && (
                <button type="button" className="console-button" disabled={busy} onClick={() => void bulk('restore')}>
                  {labels['content.bulk.restore']}
                </button>
              )
            : bulkable('trash') && (
                <button type="button" className="console-button" disabled={busy} onClick={() => void bulk('trash')}>
                  {labels['content.bulk.trash']}
                </button>
              )}
        </div>
      )}

      {failed ? (
        <div className="console-alert" data-tone="error" role="alert">
          <span>{labels[failed]}</span>
          <button type="button" className="console-button" onClick={() => void load(query)}>
            {labels['content.retry']}
          </button>
        </div>
      ) : loading && rows.length === 0 ? (
        <ul className="console-rows" aria-label={labels['content.loading']}>
          {Array.from({ length: Math.min(view.per, 6) }, (_, index) => (
            <li className="console-row-skeleton" key={index} />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="console-lede">{labels['content.empty']}</p>
      ) : view.mode === 'card' ? (
        <>
          {/* Card mode has no header row to hang the page-wide checkbox on, and cards are the
              phone mode — where tapping 25 boxes by hand is the whole job. */}
          <div className="console-cards-head">
            <label className="console-inline">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={labels['content.select.all']} />
              <span>{labels['content.select.all']}</span>
            </label>
          </div>
          <ul className="console-cards">
            {rows.map((row) => (
              <li key={row.id} className="console-card" data-active={row.id === selectedId || undefined}>
                <label className="console-card-check">
                  <input type="checkbox" checked={checked.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={titleOf(row, locale)} />
                </label>
                <button type="button" className="console-card-body" onClick={() => onSelect(row.id === selectedId ? null : row)}>
                  <span className="console-row-title">{titleOf(row, locale)}</span>
                  <span className="console-chip">{labels[stateOf(row)]}</span>
                  <code className="console-row-key">{row.key}</code>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th className="console-cell-check">
                  <label>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label={labels['content.select.all']} />
                  </label>
                </th>
                {sorts.map((sort) => (
                  <th key={sort} aria-sort={view.sort === sort ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      className="console-sort"
                      data-active={view.sort === sort || undefined}
                      onClick={() => setView(withSort(view, sort))}
                    >
                      {labels[SORT_KEYS[sort]]}
                      {view.sort === sort ? (view.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                {columns.map((name) => (
                  <th key={name} className="console-cell-extra">
                    {labels[`content.field.${name}` as MessageKey] ?? name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-active={row.id === selectedId || undefined}>
                  <td className="console-cell-check">
                    <label>
                      <input type="checkbox" checked={checked.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={titleOf(row, locale)} />
                    </label>
                  </td>
                  <td>
                    <button type="button" className="console-row" onClick={() => onSelect(row.id === selectedId ? null : row)}>
                      <span className="console-row-title">{titleOf(row, locale)}</span>
                    </button>
                  </td>
                  <td>
                    <code className="console-row-key">{row.key}</code>
                  </td>
                  <td>
                    <span className="console-chip">{labels[stateOf(row)]}</span>
                  </td>
                  <td>{row.updatedAt.slice(0, 10)}</td>
                  {sorts.includes('published') && <td>{row.publishedAt ? row.publishedAt.slice(0, 10) : '—'}</td>}
                  {sorts.includes('position') && <td>{cellText(row.cells.position ?? null)}</td>}
                  {columns.map((name) => (
                    <td key={name} className="console-cell-extra">
                      {cellText(row.cells[name] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="console-pager">
        <span className="console-count">
          {page.total} {labels['content.total']}
        </span>
        {page.pages > 1 && (
          <span className="console-controls">
            <button type="button" className="console-button" disabled={page.page <= 1} onClick={() => setView(withPage(view, page.page - 1))}>
              {labels['content.page.prev']}
            </button>
            <span className="console-meta">
              {labels['content.page']} {page.page} {labels['content.page.of']} {page.pages}
            </span>
            <button type="button" className="console-button" disabled={page.page >= page.pages} onClick={() => setView(withPage(view, page.page + 1))}>
              {labels['content.page.next']}
            </button>
          </span>
        )}
      </div>

      {notice && (
        <p className="console-alert" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {labels[notice.key]}
        </p>
      )}
    </div>
  );
}
