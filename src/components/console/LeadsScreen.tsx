'use client';

/**
 * The leads screen: one page of requests, and the one you picked beside it.
 *
 * It is the console's first screen whose rows are people rather than documents, so it
 * behaves differently in three places:
 *
 *   - the counts live above the list as filter chips, because "how many are still new"
 *     is the question the screen exists to answer;
 *   - the detail pane is where the work happens — a status move and a note are the two
 *     verbs, and neither needs a draft because a lead has no published twin;
 *   - a row with `contact_hidden` still appears. A Viewer's job is to count, so the
 *     record is shown and the name, phone, message and notes are replaced by a sentence
 *     that says the field is withheld rather than pretending the visitor left it blank.
 *
 * The URL is the state, as on every list: a filter a person set is a link they can hand
 * over. `replaceState`, never `pushState` — a chip press is not a page.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { consoleCall, consoleRead } from './client-api';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, Badge, Empty, Note, Skeleton, type Tone } from '@/components/ui/Status';
import { Card, RowAction, RowTitle } from '@/components/ui/Surface';
import { Chip, ChipRow } from '@/components/ui/Chip';
import { LEAD_SOURCES, LEAD_STATUSES, type LeadStatus } from '@/lib/leads/kinds';
import type { LeadCounts, LeadNote } from '@/lib/leads/store';
import type { LeadRow, LeadsScreenData, LeadsView } from '@/lib/leads/view';
import type { MessageKey } from '@/lib/console/messages';
import type { ConsoleLocale } from '@/lib/console/prefs';

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  key: MessageKey;
}

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'warn',
  contacted: 'neutral',
  booked: 'ok',
  done: 'ok',
  lost: 'danger',
};

const STATUS_KEY: Record<LeadStatus, MessageKey> = {
  new: 'leads.status.new',
  contacted: 'leads.status.contacted',
  booked: 'leads.status.booked',
  done: 'leads.status.done',
  lost: 'leads.status.lost',
};

const SOURCE_KEY: Record<string, MessageKey> = {
  booking: 'leads.source.booking',
  'contact-form': 'leads.source.contact-form',
};

const FIELD_KEYS: Record<string, MessageKey> = {
  date: 'leads.field.date',
  service: 'leads.field.service',
  offer: 'leads.field.offer',
  branch: 'leads.field.branch',
  subject: 'leads.field.subject',
};

const PER_PAGES = [25, 50, 100];

function queryOf(view: LeadsView): string {
  const params = new URLSearchParams();
  if (view.status) params.set('status', view.status);
  if (view.source) params.set('source', view.source);
  if (view.q) params.set('q', view.q);
  if (view.page > 1) params.set('page', String(view.page));
  if (view.per !== 25) params.set('per', String(view.per));
  const line = params.toString();
  return line ? `?${line}` : '';
}

/** A stable, timezone-proof stamp: the server and the browser must agree on this text. */
function stamp(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : '';
}

function sourceName(source: string, labels: Labels): string {
  const key = SOURCE_KEY[source];
  return key ? labels[key] : source;
}

function valueOf(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function LeadsScreen({
  initial,
  labels,
  locale,
}: Readonly<{ initial: LeadsScreenData; labels: Labels; locale: ConsoleLocale }>) {
  const [view, setView] = useState<LeadsView>(initial.view);
  const [rows, setRows] = useState<LeadRow[]>(initial.rows);
  const [counts, setCounts] = useState<LeadCounts>(initial.counts);
  const [list, setList] = useState({ total: initial.total, page: initial.page, pages: initial.pages });
  const [term, setTerm] = useState(initial.view.q);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initial.rows[0]?.id ?? null);
  const [detail, setDetail] = useState<LeadRow | null>(initial.rows[0] ?? null);
  const [notes, setNotes] = useState<LeadNote[]>(initial.notes);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const picked = useRef<string | null>(initial.rows[0]?.id ?? null);

  const ArrowBack = locale === 'ar' ? ChevronRight : ChevronLeft;
  const ArrowForward = locale === 'ar' ? ChevronLeft : ChevronRight;

  const load = useCallback(async (next: LeadsView): Promise<void> => {
    setLoading(true);
    setFailed(false);
    const result = await consoleRead<{
      leads?: LeadRow[];
      total?: number;
      page?: number;
      pages?: number;
      counts?: LeadCounts;
    }>(`/api/console/leads${queryOf(next)}`);
    setLoading(false);
    if (!result.data?.leads) {
      setFailed(true);
      return;
    }
    setRows(result.data.leads);
    if (result.data.counts) setCounts(result.data.counts);
    setList({
      total: result.data.total ?? 0,
      page: result.data.page ?? 1,
      pages: result.data.pages ?? 1,
    });
    // A row that left the current filter must not stay selected in the detail pane.
    if (selectedId && !result.data.leads.some((row) => row.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
      setNotes([]);
      picked.current = null;
    }
  }, [selectedId]);

  const signature = JSON.stringify(view);
  const drawn = useRef(signature);
  useEffect(() => {
    if (drawn.current === signature) return;
    drawn.current = signature;
    window.history.replaceState(null, '', `/console/leads${queryOf(view)}`);
    void load(view);
  }, [signature, view, load]);

  // A search that queried every keystroke would run a LIKE over every lead eight times
  // for one phone number.
  useEffect(() => {
    if (term.trim() === view.q) return;
    const timer = setTimeout(() => setView((current) => ({ ...current, q: term.trim(), page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [term, view.q]);

  const mergeLead = useCallback((lead: LeadRow): void => {
    setRows((current) => current.map((row) => (row.id === lead.id ? lead : row)));
    setDetail((current) => (current?.id === lead.id ? lead : current));
  }, []);

  async function pick(row: LeadRow): Promise<void> {
    if (picked.current === row.id) {
      setSelectedId(null);
      setDetail(null);
      setNotes([]);
      picked.current = null;
      return;
    }
    picked.current = row.id;
    setSelectedId(row.id);
    setDetail(row);
    setNotes([]);
    setNote('');
    const result = await consoleRead<{ lead?: LeadRow; notes?: LeadNote[] }>(`/api/console/leads/${row.id}`);
    if (picked.current !== row.id) return;
    if (result.data?.lead) mergeLead(result.data.lead);
    setNotes(result.data?.notes ?? []);
  }

  async function move(status: LeadStatus): Promise<void> {
    if (!detail?.editable) return;
    setBusy(true);
    const result = await consoleCall<{ lead?: LeadRow }>(
      `/api/console/leads/${detail.id}?source=${encodeURIComponent(detail.source)}`,
      'PATCH',
      { status },
    );
    setBusy(false);
    if (!result.data?.lead) {
      setNotice({ tone: 'danger', key: 'leads.status.failed' });
      return;
    }
    mergeLead(result.data.lead);
    setNotice({ tone: 'ok', key: 'leads.status.saved' });
    void load(view);
  }

  async function addNote(): Promise<void> {
    const body = note.trim();
    if (!body || !detail?.editable) return;
    setBusy(true);
    const result = await consoleCall<{ note?: LeadNote }>(
      `/api/console/leads/${detail.id}/notes?source=${encodeURIComponent(detail.source)}`,
      'POST',
      { body },
    );
    setBusy(false);
    if (!result.data?.note) {
      setNotice({ tone: 'danger', key: 'leads.note.failed' });
      return;
    }
    setNotes((current) => [...current, result.data?.note as LeadNote]);
    setNote('');
    setNotice({ tone: 'ok', key: 'leads.note.saved' });
  }

  const sources = [...LEAD_SOURCES];
  if (view.source && !(sources as string[]).includes(view.source)) sources.push(view.source as (typeof LEAD_SOURCES)[number]);

  return (
    <div className="console-leads">
      <p className="ui-lede">{labels['leads.intro']}</p>

      <ChipRow label={labels['leads.filter.all']}>
        <Chip
          active={view.status === null}
          aria-pressed={view.status === null}
          onClick={() => setView((current) => ({ ...current, status: null, page: 1 }))}
        >
          {labels['leads.filter.all']} · {counts.all}
        </Chip>
        {LEAD_STATUSES.map((status) => (
          <Chip
            key={status}
            active={view.status === status}
            aria-pressed={view.status === status}
            onClick={() => setView((current) => ({ ...current, status, page: 1 }))}
          >
            {labels[STATUS_KEY[status]]} · {counts[status]}
          </Chip>
        ))}
      </ChipRow>

      <div className="console-list-bar">
        <Input
          bar
          className="console-search"
          type="search"
          value={term}
          placeholder={labels['leads.search']}
          aria-label={labels['leads.search']}
          onChange={(event) => setTerm(event.target.value)}
        />
        <label className="console-inline">
          {labels['leads.field.source']}
          <Select
            bar
            value={view.source ?? ''}
            onChange={(event) => setView((current) => ({ ...current, source: event.target.value || null, page: 1 }))}
          >
            <option value="">{labels['leads.source.all']}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {sourceName(source, labels)}
              </option>
            ))}
          </Select>
        </label>
        <label className="console-inline">
          {labels['leads.per_page']}
          <Select
            bar
            value={String(view.per)}
            onChange={(event) => setView((current) => ({ ...current, per: Number(event.target.value) || 25, page: 1 }))}
          >
            {PER_PAGES.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="console-leads-split">
        <div className="console-leads-list" aria-busy={loading}>
          {failed ? (
            <Alert tone="danger">
              {labels['leads.load_failed']}
              <Button onClick={() => void load(view)}>{labels['leads.retry']}</Button>
            </Alert>
          ) : loading && rows.length === 0 ? (
            <Skeleton rows={Math.min(view.per, 6)} label={labels['leads.loading']} />
          ) : rows.length === 0 ? (
            <Empty>{labels['leads.empty']}</Empty>
          ) : (
            <Card flat flush className="console-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>{labels['leads.field.created']}</th>
                    <th>{labels['leads.field.name']}</th>
                    <th className="console-cell-extra">{labels['leads.field.source']}</th>
                    <th className="console-cell-extra">{labels['leads.field.phone']}</th>
                    <th>{labels['leads.field.status']}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} data-active={row.id === selectedId || undefined}>
                      <td>
                        <time dateTime={row.createdAt}>{stamp(row.createdAt)}</time>
                      </td>
                      <td>
                        <RowAction
                          aria-expanded={row.id === selectedId}
                          aria-controls="lead-detail"
                          onClick={() => void pick(row)}
                        >
                          <RowTitle>{row.contact_hidden ? labels['leads.read_only'] : row.name}</RowTitle>
                        </RowAction>
                      </td>
                      <td className="console-cell-extra">{sourceName(row.source, labels)}</td>
                      <td className="console-cell-extra">{row.contact_hidden ? labels['leads.field.none'] : row.phone}</td>
                      <td>
                        <Badge tone={STATUS_TONE[row.status]}>{labels[STATUS_KEY[row.status]]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="console-pager">
            <Note className="console-count">
              {list.total} {labels['leads.total']}
            </Note>
            {list.pages > 1 && (
              <span className="console-controls">
                <Button
                  disabled={list.page <= 1}
                  leading={<ArrowBack size={16} aria-hidden="true" />}
                  onClick={() => setView((current) => ({ ...current, page: list.page - 1 }))}
                >
                  {labels['leads.page.prev']}
                </Button>
                <Note>
                  {labels['leads.page']} {list.page} {labels['leads.page.of']} {list.pages}
                </Note>
                <Button
                  disabled={list.page >= list.pages}
                  trailing={<ArrowForward size={16} aria-hidden="true" />}
                  onClick={() => setView((current) => ({ ...current, page: list.page + 1 }))}
                >
                  {labels['leads.page.next']}
                </Button>
              </span>
            )}
          </div>
        </div>

        <Card id="lead-detail" className="console-lead-detail" aria-label={labels['leads.detail']}>
          {!detail ? (
            <Empty>{labels['leads.detail.none']}</Empty>
          ) : (
            <>
              <h2 className="console-lead-title">
                {detail.contact_hidden ? labels['leads.read_only'] : detail.name}
              </h2>
              <Badge tone={STATUS_TONE[detail.status]}>{labels[STATUS_KEY[detail.status]]}</Badge>

              {detail.contact_hidden ? (
                <Note tone="warn">{labels['leads.contact_hidden']}</Note>
              ) : (
                <dl className="console-lead-meta">
                  <dt>{labels['leads.field.phone']}</dt>
                  <dd>
                    <a href={`tel:${detail.phone}`}>{detail.phone}</a>
                  </dd>
                  {detail.email && (
                    <>
                      <dt>{labels['leads.field.email']}</dt>
                      <dd>
                        <a href={`mailto:${detail.email}`}>{detail.email}</a>
                      </dd>
                    </>
                  )}
                </dl>
              )}

              <dl className="console-lead-meta">
                <dt>{labels['leads.field.source']}</dt>
                <dd>{sourceName(detail.source, labels)}</dd>
                <dt>{labels['leads.field.locale']}</dt>
                <dd>{detail.locale === 'en' ? 'English' : 'العربية'}</dd>
                <dt>{labels['leads.field.created']}</dt>
                <dd>
                  <time dateTime={detail.createdAt}>{stamp(detail.createdAt)}</time>
                </dd>
                {detail.pagePath && (
                  <>
                    <dt>{labels['leads.field.page']}</dt>
                    <dd>{detail.pagePath}</dd>
                  </>
                )}
                {detail.referrer && (
                  <>
                    <dt>{labels['leads.field.referrer']}</dt>
                    <dd>{detail.referrer}</dd>
                  </>
                )}
                {detail.utm && Object.keys(detail.utm).length > 0 && (
                  <>
                    <dt>{labels['leads.field.campaign']}</dt>
                    <dd>{Object.values(detail.utm).join(' · ')}</dd>
                  </>
                )}
                {Object.entries(detail.fields ?? {}).map(([key, value]) => {
                  const shown = valueOf(value);
                  if (!shown) return null;
                  const label = FIELD_KEYS[key];
                  return (
                    <Fragment key={key}>
                      <dt>{label ? labels[label] : key}</dt>
                      <dd>{shown}</dd>
                    </Fragment>
                  );
                })}
              </dl>

              {!detail.contact_hidden && detail.message && (
                <div className="console-lead-message">
                  <p className="console-lead-caption">{labels['leads.field.message']}</p>
                  <p>{detail.message}</p>
                </div>
              )}

              {detail.editable ? (
                <div className="console-lead-actions">
                  <label className="console-inline">
                    {labels['leads.field.status']}
                    <Select
                      value={detail.status}
                      disabled={busy}
                      onChange={(event) => void move(event.target.value as LeadStatus)}
                    >
                      {LEAD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {labels[STATUS_KEY[status]]}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              ) : null}

              <section className="console-lead-notes" aria-label={labels['leads.field.notes']}>
                <h3 className="console-lead-caption">{labels['leads.field.notes']}</h3>
                {!detail.contact_hidden && notes.length === 0 && <Note>{labels['leads.note.empty']}</Note>}
                <ul className="console-lead-note-list">
                  {notes.map((entry) => (
                    <li key={entry.id} className="console-lead-note">
                      <p>{entry.body}</p>
                      <Note>
                        {entry.author || labels['leads.read_only']} · {stamp(entry.createdAt)}
                      </Note>
                    </li>
                  ))}
                </ul>
                {detail.editable && (
                  <div className="console-lead-note-form">
                    <Textarea
                      className="console-lead-note-input"
                      value={note}
                      rows={3}
                      maxLength={2000}
                      placeholder={labels['leads.note.placeholder']}
                      aria-label={labels['leads.note.placeholder']}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <Button variant="primary" loading={busy} disabled={note.trim() === ''} onClick={() => void addNote()}>
                      {labels['leads.note.add']}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </Card>
      </div>

      {notice && <Alert tone={notice.tone}>{labels[notice.key]}</Alert>}
    </div>
  );
}
