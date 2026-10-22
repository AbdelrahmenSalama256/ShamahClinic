'use client';

/**
 * One workspace for every content kind: the rows on the left, the editor on the
 * right, and the four lifecycle actions (save, publish, Trash, history) under the
 * fields.
 *
 * It is a client component because the editing session is one — typing, switching
 * a language tab, pressing publish — while every fact in it comes from the server:
 * the rows arrive rendered, and each call answers with the row as the database now
 * holds it, which is what gets shown afterwards. Nothing is trusted from the form:
 * `?locale=` and `?list=` name the scope the guard checks, and the draft/published
 * split stays in `src/lib/content`.
 */
import { useMemo, useState } from 'react';
import { consoleCall, consoleRead } from './client-api';
import type { ContentScreenData, ContentScope } from '@/lib/console/content-screen';
import type { ContentLocale } from '@/lib/content/kinds';
import type { ContentRow, FieldView } from '@/lib/content/store';
import type { RevisionView } from '@/lib/content/publish';
import type { MessageKey } from '@/lib/console/messages';

type Form = Record<string, string | boolean>;

function firstText(row: ContentRow, locale: ContentLocale): string {
  const other: ContentLocale = locale === 'ar' ? 'en' : 'ar';
  for (const candidate of ['title', 'name']) {
    const field = row.fields[candidate];
    if (field?.kind !== 'bi') continue;
    const text = field.draft?.[locale]?.trim() || field.draft?.[other]?.trim();
    if (text) return text;
  }
  // A list item owns no columns: its name is a key inside the JSON document, so the
  // row would otherwise show the slug it already prints on the right.
  for (const field of Object.values(row.fields)) {
    if (field.kind !== 'json' || typeof field.draftJson !== 'object' || field.draftJson === null) continue;
    const doc = field.draftJson as Record<string, unknown>;
    for (const key of ['name', 'title', 'question', 'label']) {
      for (const suffix of [locale, other, '']) {
        const value = doc[suffix ? `${key}_${suffix}` : key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
  }
  return row.key;
}

/** The row's state, as one chip. `pending` is the draft having outrun the published copy. */
function stateKey(row: ContentRow): MessageKey {
  if (row.trashed) return 'content.state.trashed';
  if (row.pendingLocales.length > 0) return 'content.state.pending';
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

  const [rows, setRows] = useState(data.rows);
  const [trash, setTrash] = useState(data.trash);
  const [listKey, setListKey] = useState<string | null>(data.listKey);
  const [locale, setLocale] = useState<ContentLocale>(data.locale === 'en' ? 'en' : 'ar');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({});
  const [formKey, setFormKey] = useState('');
  const [history, setHistory] = useState<{ id: string; revisions: RevisionView[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; key: MessageKey } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);
  const revisions = history && history.id === selectedId ? history.revisions : null;

  /** The scope a write names for this row: the language tab, or the list it belongs to. */
  const scope: ContentScope = named ? (listKey ?? '') : locale;
  const writable = data.abilities.update.includes(scope);
  const publishable = data.abilities.publish.filter((candidate) => !named || candidate === listKey);

  /** The scope a write names: a bilingual row names its language tab, a list item its list. */
  function query(): string {
    const params = new URLSearchParams(named ? { list: String(scope) } : { locale });
    return `?${params.toString()}`;
  }

  /** Where the list query and the Trash toggle go; a bilingual kind only ever adds `trash`. */
  function collectionQuery(withTrash: boolean, forKey?: string): string {
    const params = new URLSearchParams();
    const key = forKey ?? String(scope);
    if (named && key) params.set('list', key);
    if (withTrash) params.set('trash', '1');
    const line = params.toString();
    return line ? `?${line}` : '';
  }

  async function reload(nextTrash = trash): Promise<ContentRow[]> {
    const result = await consoleRead<{ rows?: ContentRow[] }>(`${api}${collectionQuery(nextTrash)}`);
    if (result.data?.rows) {
      setRows(result.data.rows);
      return result.data.rows;
    }
    setNotice({ tone: 'error', key: 'content.load_failed' });
    return [];
  }

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
  const editing = `${selectedId ?? ''}.${locale}`;
  if (formKey !== editing) {
    setFormKey(editing);
    setForm(selected ? formOf(selected, locale) : {});
  }

  function fieldsFromRow(row: ContentRow): Record<string, unknown> | null {
    const fields: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(row.fields)) {
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
    if (!selected) return;
    const fields = fieldsFromRow(selected);
    if (!fields) {
      setNotice({ tone: 'error', key: 'content.error.json' });
      return;
    }
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${selected.id}${query()}`, 'PATCH', {
      fields,
      version: selected.version,
    });
    setBusy(false);
    tell(result, 'content.saved');
    // The row the database now holds is what the editor shows next, version and all.
    const next = result.data?.row;
    if (next) setRows((current) => current.map((row) => (row.id === next.id ? next : row)));
    else await reload();
  }

  async function publish(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${selected.id}/publish${query()}`, 'POST', {
      locales: named ? undefined : publishable,
    });
    setBusy(false);
    tell(result, 'content.published');
    await reload();
  }

  async function moveToTrash(row: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleCall(`${api}/${row.id}${query()}`, 'DELETE', { trashed: true });
    setBusy(false);
    tell(result, 'content.trashed');
    setSelectedId(null);
    await reload();
  }

  async function restore(row: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleCall(`${api}/${row.id}/restore${query()}`, 'POST', {});
    setBusy(false);
    tell(result, 'content.restored');
    await reload();
  }

  async function openHistory(row: ContentRow): Promise<void> {
    setBusy(true);
    const result = await consoleRead<{ revisions?: RevisionView[] }>(`${api}/${row.id}/revisions${collectionQuery(false)}`);
    setBusy(false);
    setHistory({ id: row.id, revisions: result.data?.revisions ?? [] });
    if (!result.data?.revisions) setNotice({ tone: 'error', key: 'content.load_failed' });
  }

  async function rollback(revision: number): Promise<void> {
    if (!selected) return;
    setBusy(true);
    const result = await consoleCall(`${api}/${selected.id}/rollback${query()}`, 'POST', { revision });
    setBusy(false);
    tell(result, 'content.rolled_back');
    await reload();
  }

  async function create(): Promise<void> {
    const key = newKey.trim();
    if (!key || !data.abilities.create.includes(scope)) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}${query()}`, 'POST', { key });
    setBusy(false);
    const row = result.data?.row;
    if (row) {
      setCreating(false);
      setNewKey('');
      setSelectedId(row.id);
      setNotice({ tone: 'ok', key: 'content.saved' });
      await reload();
      return;
    }
    tell(result, 'content.saved');
  }

  /** A bilingual row edits one locale at a time, so the tab is the scope of the next write. */
  function switchLocale(next: ContentLocale): void {
    setLocale(next);
    setNotice(null);
  }

  function pickList(next: string): void {
    setListKey(next);
    setSelectedId(null);
    setNotice(null);
    void (async () => {
      const params = new URLSearchParams({ list: next });
      if (trash) params.set('trash', '1');
      const result = await consoleRead<{ rows?: ContentRow[] }>(`${api}?${params.toString()}`);
      if (result.data?.rows) setRows(result.data.rows);
      else setNotice({ tone: 'error', key: 'content.load_failed' });
    })();
  }

  function toggleTrash(): void {
    const next = !trash;
    setTrash(next);
    setSelectedId(null);
    setNotice(null);
    void reload(next);
  }

  const canEditRow = selected !== null && writable && !selected.trashed;

  return (
    <div className="console-work" data-kind={kind}>
      <section className="console-work-list" aria-label={labels['content.pick_row']}>
        <div className="console-controls console-work-bar">
          <button type="button" className="console-button" onClick={toggleTrash} aria-pressed={trash}>
            {trash ? labels['content.live'] : labels['content.trash']}
          </button>
          {data.abilities.create.includes(scope) && !trash && (
            <button type="button" className="console-button" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
              {labels['content.new']}
            </button>
          )}
          <span className="console-count">{rows.length}</span>
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

        {rows.length === 0 ? (
          <p className="console-lede">{labels['content.empty']}</p>
        ) : (
          <ul className="console-rows">
            {rows.map((row) => (
              <li key={row.id} className="console-row-item">
                <button
                  type="button"
                  className="console-row"
                  data-active={row.id === selectedId || undefined}
                  onClick={() => {
                    setSelectedId(row.id);
                    setNotice(null);
                  }}
                >
                  <span className="console-row-title">{firstText(row, locale)}</span>
                  <span className="console-chip">{labels[stateKey(row)]}</span>
                  <code className="console-row-key">{row.key}</code>
                </button>
                {trash && data.abilities.update.includes(scope) && (
                  <button type="button" className="console-button" onClick={() => void restore(row)} disabled={busy}>
                    {labels['content.restore']}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="console-work-edit">
        {/* A list screen switches lists, so its tabs are the only way to reach a list
            whose rows are not on screen — they have to survive an empty selection. */}
        {(named || selected) && (
          <div className="console-tabs" role="tablist" aria-label={labels[named ? 'content.list.pick' : 'content.language']}>
            {data.scopes.map((candidate) => (
              <button
                key={String(candidate)}
                type="button"
                role="tab"
                aria-selected={String(candidate) === String(scope)}
                className="console-button"
                data-active={String(candidate) === String(scope) || undefined}
                onClick={() => (named ? pickList(String(candidate)) : switchLocale(candidate as ContentLocale))}
              >
                {named ? (data.lists.find((list) => list.key === candidate)?.label ?? String(candidate)) : labels[`content.locale.${candidate}` as MessageKey]}
              </button>
            ))}
          </div>
        )}

        {!selected ? (
          <p className="console-lede">{labels['content.pick_row']}</p>
        ) : (
          <>
            <header className="console-work-head">
              <h2>{selected.key}</h2>
              <span className="console-chip">{labels[stateKey(selected)]}</span>
              <span className="console-meta">
                {labels['content.version']} {selected.version} ·{' '}
                {selected.publishedAt ? `${labels['content.published_at']}: ${selected.publishedAt.slice(0, 10)}` : labels['content.no_history']} ·{' '}
                {labels['content.updated_at']}: {selected.updatedAt.slice(0, 10)}
              </span>
            </header>

            {selected.trashed ? (
              <p className="console-alert" data-tone="error">
                {labels['content.state.trashed']}
              </p>
            ) : !writable ? (
              <p className="console-alert">{labels[data.abilities.update.length === 0 ? 'content.readonly' : 'content.locale_locked']}</p>
            ) : null}

            <div className="console-fields">
              {Object.entries(selected.fields).map(([name, field]) => (
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
              {publishable.length > 0 && !selected.trashed && (
                <button type="button" className="console-button" onClick={() => void publish()} disabled={busy}>
                  {labels['content.publish']}
                </button>
              )}
              {data.abilities.remove.includes(scope) && !selected.trashed && (
                <button type="button" className="console-button" onClick={() => void moveToTrash(selected)} disabled={busy}>
                  {labels['content.trash_item']}
                </button>
              )}
              {selected.trashed && data.abilities.update.includes(scope) && (
                <button type="button" className="console-button" onClick={() => void restore(selected)} disabled={busy}>
                  {labels['content.restore']}
                </button>
              )}
              <button type="button" className="console-button" onClick={() => void openHistory(selected)}>
                {labels['content.history']}
              </button>
            </div>

            {revisions !== null && (
              <div className="console-panel console-history">
                {revisions.length === 0 ? (
                  <p className="console-lede">{labels['content.no_history']}</p>
                ) : (
                  <ul className="console-rows">
                    {revisions.map((revision) => (
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
        )}

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
