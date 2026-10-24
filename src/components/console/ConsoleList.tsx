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
 * A row is a link. Its address is `/console/<kind>/<id>`, so opening one is ordinary
 * navigation: reload, Back and a pasted link all do what they say. The table is drawn
 * around what a row *is* — a picture, a title, the identity under it, its state, when it
 * moved — rather than one column per sortable key.
 *
 * Two things it deliberately does not do. It never filters the rows it already has: 92
 * articles is a page of titles, not 92 article bodies pulled to the browser. And it draws
 * no control the kind cannot honour — `sorts` and `filters` come from the server, so an
 * article list shows no "Order" column and no "Off" chip.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { consoleCall, consoleRead } from './client-api';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Alert, Badge, Empty, Mark, Note, Skeleton, type Tone } from '@/components/ui/Status';
import { Card, RowKey, RowTitle } from '@/components/ui/Surface';
import { Chip, ChipRemove, ChipRow, ChipTag } from '@/components/ui/Chip';
import { contentStateTone } from '@/lib/console/editor-form';
import { contentDetailPath } from '@/lib/console/paths';
import type { ContentAbilities } from '@/lib/console/content-screen';
import type { ContentKind, ContentLocale } from '@/lib/content/kinds';
import {
  LIST_PER_PAGES,
  listViewQuery,
  parseListView,
  withPage,
  withSort,
  withView,
  writeScopeQuery,
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
  /** the scope chips and saved views change it; the parent owns it because the URL names it */
  onScopeChange: (scope: ListScope) => void;
  /** bump it and the list re-reads the same view */
  refreshToken?: number;
}

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
  if (row.publishedAt && (row.pendingAr || row.pendingEn)) return 'content.state.pending';
  return row.status === 'published' || row.status === 'changed' ? 'content.state.published' : 'content.state.draft';
}

/**
 * A cell whose entire content is yes, no, or nothing.
 *
 * `Mark` is the part that carries the word: printed as `●`/`○`/`—` alone, the three
 * boolean and empty columns of a kind's own columns were silent to a screen reader, and
 * the em dash was written twice in this file — once here, once in the published column.
 */
function cell(value: string | number | boolean | null, labels: Record<MessageKey, string>): ReactNode {
  if (value === null || value === '') return <Mark state="none" label={labels['content.value.none']} />;
  if (typeof value === 'boolean') {
    return <Mark state={value ? 'yes' : 'no'} label={labels[value ? 'content.value.yes' : 'content.value.no']} />;
  }
  return String(value);
}

/**
 * The picture the site will show, at the size a table can hold.
 *
 * Offers, services and result stories all carry one; an article carries a single URL.
 * A row with none is not a blank cell — a work surface that silently drops the column
 * leaves an editor wondering whether their upload failed — so the empty state says so.
 */
function Thumb({ src, labels }: Readonly<{ src: string | null; labels: Record<MessageKey, string> }>) {
  if (!src) {
    return (
      <span className="console-thumb" data-empty="true" role="img" aria-label={labels['content.image.none']}>
        <ImageOff size={16} aria-hidden="true" />
      </span>
    );
  }
  // The URL is whatever the content already carries — a mirrored WordPress path, a CDN,
  // a data URL — so it cannot be listed in `next.config`'s image hosts at build time.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="console-thumb" src={src} alt="" width={44} height={44} loading="lazy" decoding="async" />;
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
  onScopeChange,
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
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);

  // The URL is the state. Scope comes first so the line reads like the navigation.
  const query = useMemo(() => listViewQuery(view, scope, kind), [view, scope, kind]);
  const api = `/api/console/content/${kind}`;
  // A pager chevron points where the row continues, and in Arabic that is the other way:
  // the label says "previous" in both, so only the glyph turns.
  const ArrowBack = locale === 'ar' ? ChevronRight : ChevronLeft;
  const ArrowForward = locale === 'ar' ? ChevronLeft : ChevronRight;

  /** The scope a write names, and the query a detail link carries. */
  const scopeQuery = writeScopeQuery({ listKey: kind === 'list_item' ? scope.listKey : null, locale });
  const detailHref = (row: ListSummary): string => `${contentDetailPath(kind, row.id)}${scopeQuery}`;

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
  // from a sibling — re-reads it and puts the same terms back in the address bar.
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

  async function bulk(verb: 'publish' | 'trash' | 'restore'): Promise<void> {
    const ids = [...checked];
    if (ids.length === 0) return;
    setBusy(true);
    const result = await consoleCall<{ done?: string[]; failed?: { code: string }[] }>(`${api}/bulk/${verb}${scopeQuery}`, 'POST', { ids });
    setBusy(false);
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'danger', key: labels[mapped] ? mapped : 'content.error.save' });
    } else {
      const partial = (result.data?.failed?.length ?? 0) > 0;
      setNotice({ tone: partial ? 'danger' : 'ok', key: partial ? 'content.bulk.partial' : 'content.bulk.done' });
      setChecked(new Set());
      await load(query);
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
      setNotice({ tone: 'danger', key: mapped });
      return;
    }
    // The chip only appears when the row comes back: a server that dies inside the
    // database answers with nothing at all, and "Filter saved." over a lost filter is
    // worse than the failure it hides.
    const saved = result.data?.view;
    if (!saved) {
      setNotice({ tone: 'danger', key: 'content.error.save' });
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
      setNotice({ tone: 'danger', key: 'content.error.save' });
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

  /** A column header, sortable when the kind honours that order. */
  const sortable = (sort: ListSort, className?: string): ReactNode => (
    <th key={sort} className={className} aria-sort={view.sort === sort ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="ui-table-sort" data-active={view.sort === sort || undefined} onClick={() => setView(withSort(view, sort))}>
        {labels[SORT_KEYS[sort]]}
        {view.sort === sort ? (view.dir === 'asc' ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />) : null}
      </button>
    </th>
  );

  return (
    <div className="console-list" data-mode={view.mode} aria-busy={loading}>
      <div className="console-list-bar">
        <ChipRow label={labels['content.filter.all']}>
          {filters.map((filter) => (
            <Chip key={filter} active={view.filter === filter} aria-pressed={view.filter === filter} onClick={() => setView(withView(view, { filter }))}>
              {labels[FILTER_KEYS[filter]]}
            </Chip>
          ))}
        </ChipRow>

        <Input
          bar
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
            <Select
              bar
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
            </Select>
          </label>
          <Button active={view.mode === 'card'} aria-pressed={view.mode === 'card'} onClick={() => setView(withView(view, { mode: view.mode === 'table' ? 'card' : 'table' }))}>
            {labels[view.mode === 'table' ? 'content.mode.card' : 'content.mode.table']}
          </Button>
          <Button onClick={() => setSaving((open) => !open)} aria-expanded={saving}>
            {labels['content.view.save']}
          </Button>
        </div>
      </div>

      {views.length > 0 && (
        <ChipRow label={labels['content.views']}>
          {views.map((row) => (
            <ChipTag key={row.id}>
              <Chip onClick={() => applyView(row.query)}>{row.name}</Chip>
              <ChipRemove aria-label={`${labels['content.view.remove']}: ${row.name}`} onClick={() => void dropView(row.id)}>
                <X size={16} aria-hidden="true" />
              </ChipRemove>
            </ChipTag>
          ))}
        </ChipRow>
      )}

      {saving && (
        <form
          className="ui-card console-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void saveView();
          }}
        >
          <Field label={labels['content.view.name']} htmlFor="view-name">
            <Input id="view-name" value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <div className="console-controls">
            <Button type="submit" variant="primary" loading={busy} disabled={newName.trim() === ''}>
              {labels['content.view.save']}
            </Button>
            <Button onClick={() => setSaving(false)}>{labels['content.cancel']}</Button>
          </div>
        </form>
      )}

      {checked.size > 0 && (
        <div className="console-bulk" role="group" aria-label={labels['content.selected']}>
          <Note className="console-count">
            {checked.size} {labels['content.selected']}
          </Note>
          {bulkable('publish') && (
            <Button disabled={busy} onClick={() => void bulk('publish')}>
              {labels['content.bulk.publish']}
            </Button>
          )}
          {scope.trash
            ? bulkable('restore') && (
                <Button disabled={busy} onClick={() => void bulk('restore')}>
                  {labels['content.bulk.restore']}
                </Button>
              )
            : bulkable('trash') && (
                <Button variant="danger" disabled={busy} onClick={() => void bulk('trash')}>
                  {labels['content.bulk.trash']}
                </Button>
              )}
        </div>
      )}

      {failed ? (
        <Alert tone="danger">
          {labels[failed]}
          <Button onClick={() => void load(query)}>{labels['content.retry']}</Button>
        </Alert>
      ) : loading && rows.length === 0 ? (
        <Skeleton rows={Math.min(view.per, 6)} label={labels['content.loading']} />
      ) : rows.length === 0 ? (
        <Empty>{labels['content.empty']}</Empty>
      ) : view.mode === 'card' ? (
        <>
          <div className="console-cards-head">
            <Checkbox checked={allChecked} onChange={toggleAll} label={labels['content.select.all']} />
          </div>
          <ul className="console-cards">
            {rows.map((row) => {
              const state = stateOf(row);
              return (
                <Card as="li" key={row.id}>
                  <Checkbox checked={checked.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={titleOf(row, locale)} />
                  <Link className="ui-row-link console-card-link" href={detailHref(row)}>
                    {page.hasImages && <Thumb src={row.image} labels={labels} />}
                    <span className="console-card-text">
                      <RowTitle>{titleOf(row, locale)}</RowTitle>
                      <RowKey>{row.key}</RowKey>
                    </span>
                    <Badge tone={contentStateTone(state)}>{labels[state]}</Badge>
                  </Link>
                </Card>
              );
            })}
          </ul>
        </>
      ) : (
        <Card flat flush className="console-table-wrap">
          <table className="ui-table console-table">
            <thead>
              <tr>
                <th className="console-cell-check">
                  <Checkbox checked={allChecked} onChange={toggleAll} aria-label={labels['content.select.all']} />
                </th>
                {sortable('title', page.hasImages ? 'console-cell-title' : undefined)}
                {sortable('status')}
                {sortable('updated')}
                {sorts.includes('published') && sortable('published')}
                {sorts.includes('position') && sortable('position')}
                {columns.map((name) => (
                  <th key={name} className="console-cell-extra">
                    {labels[`content.field.${name}` as MessageKey] ?? name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = stateOf(row);
                return (
                  <tr key={row.id}>
                    <td className="console-cell-check">
                      <Checkbox checked={checked.has(row.id)} onChange={() => toggleRow(row.id)} aria-label={titleOf(row, locale)} />
                    </td>
                    <td className="console-cell-title">
                      <Link className="ui-row-link console-row-link" href={detailHref(row)}>
                        {page.hasImages && <Thumb src={row.image} labels={labels} />}
                        <span className="console-row-text">
                          <RowTitle>{titleOf(row, locale)}</RowTitle>
                          <RowKey>{row.key}</RowKey>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge tone={contentStateTone(state)}>{labels[state]}</Badge>
                    </td>
                    <td className="console-cell-date">
                      <bdi>{row.updatedAt.slice(0, 10)}</bdi>
                    </td>
                    {sorts.includes('published') && (
                      <td className="console-cell-date">
                        {row.publishedAt ? <bdi>{row.publishedAt.slice(0, 10)}</bdi> : <Mark state="none" label={labels['content.value.none']} />}
                      </td>
                    )}
                    {sorts.includes('position') && <td>{cell(row.cells.position ?? null, labels)}</td>}
                    {columns.map((name) => (
                      <td key={name} className="console-cell-extra">
                        {cell(row.cells[name] ?? null, labels)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <div className="console-pager">
        <Note className="console-count">
          {page.total} {labels['content.total']}
        </Note>
        {page.pages > 1 && (
          <span className="console-controls">
            <Button disabled={page.page <= 1} leading={<ArrowBack size={16} aria-hidden="true" />} onClick={() => setView(withPage(view, page.page - 1))}>
              {labels['content.page.prev']}
            </Button>
            <Note>
              {labels['content.page']} {page.page} {labels['content.page.of']} {page.pages}
            </Note>
            <Button disabled={page.page >= page.pages} trailing={<ArrowForward size={16} aria-hidden="true" />} onClick={() => setView(withPage(view, page.page + 1))}>
              {labels['content.page.next']}
            </Button>
          </span>
        )}
      </div>

      {notice && <Alert tone={notice.tone}>{labels[notice.key]}</Alert>}
    </div>
  );
}
