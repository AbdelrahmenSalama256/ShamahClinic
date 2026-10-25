"use client";

/**
 * The leads screen: one page of requests, and the one you picked beside it.
 *
 * It is the console's first screen whose rows are people rather than documents, so it
 * behaves differently in three places:
 *
 *   - the counts live above the list as filter chips, because "how many are still new"
 *     is the question the screen exists to answer — a proportional bar above them shows
 *     the same counts at a glance;
 *   - the detail pane is where the work happens — a status move and a note are the two
 *     verbs, and neither needs a draft because a lead has no published twin;
 *   - a row with `contact_hidden` still appears. A Viewer's job is to count, so the
 *     record is shown and the name, phone, message and notes are replaced by a sentence
 *     that says the field is withheld rather than pretending the visitor left it blank.
 *
 * The URL is the state, as on every list: a filter a person set is a link they can hand
 * over. `replaceState`, never `pushState` — a chip press is not a page.
 *
 * Below 1024px the detail is not a pane beside the list but a sheet over it, opened only
 * by a person's own pick (the row selected on first load never opens it). Esc, the back
 * button and the scrim all close it and hand focus back to the row it came from.
 * Presentation lives in `console-leads.css`.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import { consoleCall, consoleRead } from "./client-api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Empty,
  Input,
  Note,
  Select,
  Skeleton,
  Textarea,
  type Tone,
} from "@/components/console/kit";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  type LeadStatus,
} from "@/lib/leads/kinds";
import type { LeadCounts, LeadNote } from "@/lib/leads/store";
import type { LeadRow, LeadsScreenData, LeadsView } from "@/lib/leads/view";
import type { MessageKey } from "@/lib/console/messages";
import type { ConsoleLocale } from "@/lib/console/prefs";

type Labels = Record<MessageKey, string>;

interface Notice {
  tone: Tone;
  key: MessageKey;
}

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "warn",
  contacted: "neutral",
  booked: "ok",
  done: "ok",
  lost: "danger",
};

const STATUS_KEY: Record<LeadStatus, MessageKey> = {
  new: "leads.status.new",
  contacted: "leads.status.contacted",
  booked: "leads.status.booked",
  done: "leads.status.done",
  lost: "leads.status.lost",
};

const SOURCE_KEY: Record<string, MessageKey> = {
  booking: "leads.source.booking",
  "contact-form": "leads.source.contact-form",
};

const FIELD_KEYS: Record<string, MessageKey> = {
  date: "leads.field.date",
  service: "leads.field.service",
  offer: "leads.field.offer",
  branch: "leads.field.branch",
  subject: "leads.field.subject",
};

const PER_PAGES = [25, 50, 100];

/** How long a success message stays up. Errors stay until the next action replaces them. */
const OK_NOTICE_MS = 4500;

function queryOf(view: LeadsView): string {
  const params = new URLSearchParams();
  if (view.status) params.set("status", view.status);
  if (view.source) params.set("source", view.source);
  if (view.q) params.set("q", view.q);
  if (view.page > 1) params.set("page", String(view.page));
  if (view.per !== 25) params.set("per", String(view.per));
  const line = params.toString();
  return line ? `?${line}` : "";
}

/** A stable, timezone-proof stamp: the server and the browser must agree on this text. */
function stamp(iso: string): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "";
}

function dateOf(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

function timeOf(iso: string): string {
  return iso ? iso.slice(11, 16) : "";
}

function sourceName(source: string, labels: Labels): string {
  const key = SOURCE_KEY[source];
  return key ? labels[key] : source;
}

function valueOf(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** A withheld name has no initial to show, so the circle holds a dot instead of a guess. */
function initialOf(row: LeadRow): string {
  if (row.contact_hidden) return "•";
  const first = Array.from(row.name.trim())[0];
  return first ? first.toUpperCase() : "•";
}

function nameOf(row: LeadRow, labels: Labels): string {
  return row.contact_hidden ? labels["leads.read_only"] : row.name;
}

/** Below this width the detail is a sheet over the list rather than a pane beside it. */
function isNarrow(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 1023.98px)").matches
  );
}

export function LeadsScreen({
  initial,
  labels,
  locale,
}: Readonly<{
  initial: LeadsScreenData;
  labels: Labels;
  locale: ConsoleLocale;
}>) {
  const [view, setView] = useState<LeadsView>(initial.view);
  const [rows, setRows] = useState<LeadRow[]>(initial.rows);
  const [counts, setCounts] = useState<LeadCounts>(initial.counts);
  const [list, setList] = useState({
    total: initial.total,
    page: initial.page,
    pages: initial.pages,
  });
  const [term, setTerm] = useState(initial.view.q);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.rows[0]?.id ?? null,
  );
  const [detail, setDetail] = useState<LeadRow | null>(initial.rows[0] ?? null);
  const [notes, setNotes] = useState<LeadNote[]>(initial.notes);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** True only after a person picked a row: the one selected on first load stays closed. */
  const [sheet, setSheet] = useState(false);
  const picked = useRef<string | null>(initial.rows[0]?.id ?? null);
  const paneRef = useRef<HTMLElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const ArrowBack = locale === "ar" ? ChevronRight : ChevronLeft;
  const ArrowForward = locale === "ar" ? ChevronLeft : ChevronRight;

  const closeDetail = useCallback((): void => {
    picked.current = null;
    setSelectedId(null);
    setDetail(null);
    setNotes([]);
    setNote("");
    setSheet(false);
  }, []);

  /** Close, and put the cursor back on the row the person came from. */
  const dismiss = useCallback((): void => {
    const id = picked.current;
    closeDetail();
    if (id) rowRefs.current.get(id)?.focus();
  }, [closeDetail]);

  const load = useCallback(
    async (next: LeadsView): Promise<void> => {
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
      if (selectedId && !result.data.leads.some((row) => row.id === selectedId))
        closeDetail();
    },
    [selectedId, closeDetail],
  );

  const signature = JSON.stringify(view);
  const drawn = useRef(signature);
  useEffect(() => {
    if (drawn.current === signature) return;
    drawn.current = signature;
    window.history.replaceState(null, "", `/console/leads${queryOf(view)}`);
    void load(view);
  }, [signature, view, load]);

  // A search that queried every keystroke would run a LIKE over every lead eight times
  // for one phone number.
  useEffect(() => {
    if (term.trim() === view.q) return;
    const timer = setTimeout(
      () => setView((current) => ({ ...current, q: term.trim(), page: 1 })),
      350,
    );
    return () => clearTimeout(timer);
  }, [term, view.q]);

  // A saved-and-done message has nothing left to say after a moment.
  useEffect(() => {
    if (notice?.tone !== "ok") return;
    const timer = window.setTimeout(() => setNotice(null), OK_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // On a narrow screen the open sheet owns the page: the page behind it stops scrolling and
  // focus moves into the sheet. On a wide screen the pane is part of the page, so neither
  // happens — a keyboard user who just picked a row keeps their place in the list.
  useEffect(() => {
    if (!sheet || !isNarrow()) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    paneRef.current?.focus();
    return () => {
      root.style.overflow = before;
    };
  }, [sheet]);

  // Esc closes the open detail, unless a field, a dialog or the header menu has it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        picked.current === null
      )
        return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  const mergeLead = useCallback((lead: LeadRow): void => {
    setRows((current) =>
      current.map((row) => (row.id === lead.id ? lead : row)),
    );
    setDetail((current) => (current?.id === lead.id ? lead : current));
  }, []);

  const pick = useCallback(
    async (row: LeadRow): Promise<void> => {
      if (picked.current === row.id) {
        dismiss();
        return;
      }
      picked.current = row.id;
      setSelectedId(row.id);
      setDetail(row);
      setNotes([]);
      setNote("");
      setSheet(true);
      const result = await consoleRead<{ lead?: LeadRow; notes?: LeadNote[] }>(
        `/api/console/leads/${row.id}`,
      );
      if (picked.current !== row.id) return;
      if (result.data?.lead) mergeLead(result.data.lead);
      setNotes(result.data?.notes ?? []);
    },
    [dismiss, mergeLead],
  );

  async function move(status: LeadStatus): Promise<void> {
    if (!detail?.editable || status === detail.status) return;
    setBusy(true);
    const result = await consoleCall<{ lead?: LeadRow }>(
      `/api/console/leads/${detail.id}?source=${encodeURIComponent(detail.source)}`,
      "PATCH",
      { status },
    );
    setBusy(false);
    if (!result.data?.lead) {
      setNotice({ tone: "danger", key: "leads.status.failed" });
      return;
    }
    mergeLead(result.data.lead);
    setNotice({ tone: "ok", key: "leads.status.saved" });
    void load(view);
  }

  async function addNote(): Promise<void> {
    const body = note.trim();
    if (!body || !detail?.editable) return;
    setBusy(true);
    const result = await consoleCall<{ note?: LeadNote }>(
      `/api/console/leads/${detail.id}/notes?source=${encodeURIComponent(detail.source)}`,
      "POST",
      { body },
    );
    setBusy(false);
    if (!result.data?.note) {
      setNotice({ tone: "danger", key: "leads.note.failed" });
      return;
    }
    setNotes((current) => [...current, result.data?.note as LeadNote]);
    setNote("");
    setNotice({ tone: "ok", key: "leads.note.saved" });
  }

  /** Arrow keys walk the list, so a keyboard user does not tab through forty rows. */
  function onListKeyDown(event: ReactKeyboardEvent<HTMLUListElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button[data-lead-row]",
      ),
    );
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = Math.min(
      buttons.length - 1,
      Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)),
    );
    buttons[next]?.focus();
  }

  const sources = [...LEAD_SOURCES];
  if (view.source && !(sources as string[]).includes(view.source))
    sources.push(view.source as (typeof LEAD_SOURCES)[number]);

  const shownFields = detail
    ? Object.entries(detail.fields ?? {})
        .map(([key, value]) => ({
          key,
          label: FIELD_KEYS[key],
          shown: valueOf(value),
        }))
        .filter((entry) => entry.shown !== "")
    : [];

  return (
    <div className="console-leads">
      <p className="console-lede">{labels["leads.intro"]}</p>

      {/* The same counts as the chips below, drawn as one bar. Decorative: the chips carry
          the numbers for anyone who cannot see it. */}
      {counts.all > 0 && (
        <div className="console-leads-pipeline" aria-hidden="true">
          {LEAD_STATUSES.map(
            (status) =>
              counts[status] > 0 && (
                <span
                  key={status}
                  data-status={status}
                  style={{ flexGrow: counts[status] }}
                />
              ),
          )}
        </div>
      )}

      <ChipRow label={labels["leads.filter.all"]}>
        <Chip
          active={view.status === null}
          aria-pressed={view.status === null}
          onClick={() =>
            setView((current) => ({ ...current, status: null, page: 1 }))
          }
        >
          {labels["leads.filter.all"]} · {counts.all}
        </Chip>
        {LEAD_STATUSES.map((status) => (
          <Chip
            key={status}
            active={view.status === status}
            aria-pressed={view.status === status}
            onClick={() =>
              setView((current) => ({ ...current, status, page: 1 }))
            }
          >
            <i
              className="console-lead-dot"
              data-status={status}
              aria-hidden="true"
            />
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
          placeholder={labels["leads.search"]}
          aria-label={labels["leads.search"]}
          onChange={(event) => setTerm(event.target.value)}
        />
        <label className="console-inline">
          {labels["leads.field.source"]}
          <Select
            bar
            value={view.source ?? ""}
            onChange={(event) =>
              setView((current) => ({
                ...current,
                source: event.target.value || null,
                page: 1,
              }))
            }
          >
            <option value="">{labels["leads.source.all"]}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {sourceName(source, labels)}
              </option>
            ))}
          </Select>
        </label>
        <label className="console-inline">
          {labels["leads.per_page"]}
          <Select
            bar
            value={String(view.per)}
            onChange={(event) =>
              setView((current) => ({
                ...current,
                per: Number(event.target.value) || 25,
                page: 1,
              }))
            }
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
              {labels["leads.load_failed"]}
              <Button onClick={() => void load(view)}>
                {labels["leads.retry"]}
              </Button>
            </Alert>
          ) : loading && rows.length === 0 ? (
            <Skeleton
              rows={Math.min(view.per, 6)}
              label={labels["leads.loading"]}
            />
          ) : rows.length === 0 ? (
            <Empty>{labels["leads.empty"]}</Empty>
          ) : (
            <Card flat flush className="console-lead-card">
              <ul className="console-lead-list" onKeyDown={onListKeyDown}>
                {rows.map((row) => {
                  const active = row.id === selectedId;
                  const source = sourceName(row.source, labels);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="console-lead-row"
                        data-lead-row
                        data-active={active || undefined}
                        data-fresh={row.status === "new" || undefined}
                        aria-expanded={active}
                        aria-controls="lead-detail"
                        onClick={() => void pick(row)}
                        ref={(node) => {
                          if (node) rowRefs.current.set(row.id, node);
                          else rowRefs.current.delete(row.id);
                        }}
                      >
                        <span
                          className="console-lead-avatar"
                          data-status={row.status}
                          aria-hidden="true"
                        >
                          {initialOf(row)}
                        </span>
                        <span className="console-lead-who">
                          <span className="console-lead-name">
                            {nameOf(row, labels)}
                          </span>
                          <span className="console-lead-sub">
                            {source} ·{" "}
                            <time dateTime={row.createdAt}>
                              {stamp(row.createdAt)}
                            </time>
                          </span>
                        </span>
                        <span className="console-lead-col console-lead-source">
                          {source}
                        </span>
                        <span className="console-lead-col console-lead-phone">
                          {row.contact_hidden ? (
                            labels["leads.field.none"]
                          ) : (
                            <bdi dir="ltr">{row.phone}</bdi>
                          )}
                        </span>
                        <time
                          className="console-lead-col console-lead-when"
                          dateTime={row.createdAt}
                        >
                          <span>{dateOf(row.createdAt)}</span>
                          <span>{timeOf(row.createdAt)}</span>
                        </time>
                        <Badge tone={STATUS_TONE[row.status]}>
                          {labels[STATUS_KEY[row.status]]}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="console-pager">
            <Note className="console-count">
              {list.total} {labels["leads.total"]}
            </Note>
            {list.pages > 1 && (
              <span className="console-controls">
                <Button
                  disabled={list.page <= 1}
                  leading={<ArrowBack size={16} aria-hidden="true" />}
                  onClick={() =>
                    setView((current) => ({ ...current, page: list.page - 1 }))
                  }
                >
                  {labels["leads.page.prev"]}
                </Button>
                <Note>
                  {labels["leads.page"]} {list.page} {labels["leads.page.of"]}{" "}
                  {list.pages}
                </Note>
                <Button
                  disabled={list.page >= list.pages}
                  trailing={<ArrowForward size={16} aria-hidden="true" />}
                  onClick={() =>
                    setView((current) => ({ ...current, page: list.page + 1 }))
                  }
                >
                  {labels["leads.page.next"]}
                </Button>
              </span>
            )}
          </div>
        </div>

        <section
          id="lead-detail"
          ref={paneRef}
          tabIndex={-1}
          className="console-lead-detail"
          data-sheet={sheet ? "open" : undefined}
          aria-label={labels["leads.detail"]}
        >
          {!detail ? (
            // An empty pane is an invitation: the dashed edge marks the slot a lead will fill.
            <div className="console-lead-stage">
              <span className="console-lead-arch" aria-hidden="true" />
              <p>{labels["leads.detail.none"]}</p>
            </div>
          ) : (
            <>
              <div className="console-lead-bar">
                <span className="console-lead-back">
                  <Button
                    leading={<ArrowBack size={16} aria-hidden="true" />}
                    onClick={dismiss}
                  >
                    {detail.contact_hidden
                      ? labels["leads.read_only"]
                      : detail.name}
                  </Button>
                </span>
                <span className="console-lead-state">
                  <Badge tone={STATUS_TONE[detail.status]}>
                    {labels[STATUS_KEY[detail.status]]}
                  </Badge>
                </span>
              </div>

              <header className="console-lead-id">
                <span
                  className="console-lead-avatar console-lead-avatar-lg"
                  data-status={detail.status}
                  aria-hidden="true"
                >
                  {initialOf(detail)}
                </span>
                <div>
                  <h2 className="console-lead-title">
                    {nameOf(detail, labels)}
                  </h2>
                  <p className="console-lead-sub">
                    {sourceName(detail.source, labels)} ·{" "}
                    <time dateTime={detail.createdAt}>
                      {stamp(detail.createdAt)}
                    </time>
                  </p>
                </div>
              </header>

              {detail.contact_hidden ? (
                <Note tone="warn">{labels["leads.contact_hidden"]}</Note>
              ) : (
                <ul className="console-lead-contact">
                  <li>
                    <a
                      className="console-lead-link"
                      href={`tel:${detail.phone}`}
                    >
                      <Phone size={18} aria-hidden="true" />
                      <span>
                        <span className="console-lead-label">
                          {labels["leads.field.phone"]}
                        </span>
                        <span className="console-lead-value">
                          <bdi dir="ltr">{detail.phone}</bdi>
                        </span>
                      </span>
                    </a>
                  </li>
                  {detail.email && (
                    <li>
                      <a
                        className="console-lead-link"
                        href={`mailto:${detail.email}`}
                      >
                        <Mail size={18} aria-hidden="true" />
                        <span>
                          <span className="console-lead-label">
                            {labels["leads.field.email"]}
                          </span>
                          <span className="console-lead-value">
                            <bdi dir="ltr">{detail.email}</bdi>
                          </span>
                        </span>
                      </a>
                    </li>
                  )}
                </ul>
              )}

              {detail.editable && (
                <div className="console-lead-actions">
                  <p className="console-lead-caption">
                    {labels["leads.field.status"]}
                  </p>
                  <ChipRow label={labels["leads.field.status"]}>
                    {LEAD_STATUSES.map((status) => (
                      <Chip
                        key={status}
                        active={detail.status === status}
                        aria-pressed={detail.status === status}
                        disabled={busy}
                        onClick={() => void move(status)}
                      >
                        <i
                          className="console-lead-dot"
                          data-status={status}
                          aria-hidden="true"
                        />
                        {labels[STATUS_KEY[status]]}
                      </Chip>
                    ))}
                  </ChipRow>
                </div>
              )}

              {!detail.contact_hidden && detail.message && (
                <div className="console-lead-message">
                  <p className="console-lead-caption">
                    {labels["leads.field.message"]}
                  </p>
                  <p className="console-lead-quote">{detail.message}</p>
                </div>
              )}

              {shownFields.length > 0 && (
                <dl className="console-lead-meta">
                  {shownFields.map((entry) => (
                    <Fragment key={entry.key}>
                      <dt>{entry.label ? labels[entry.label] : entry.key}</dt>
                      <dd>{entry.shown}</dd>
                    </Fragment>
                  ))}
                </dl>
              )}

              <section
                className="console-lead-notes"
                aria-label={labels["leads.field.notes"]}
              >
                <h3 className="console-lead-caption">
                  {labels["leads.field.notes"]}
                </h3>
                {!detail.contact_hidden && notes.length === 0 && (
                  <Note>{labels["leads.note.empty"]}</Note>
                )}
                <ol className="console-lead-timeline">
                  {notes.map((entry) => (
                    <li key={entry.id}>
                      <p>{entry.body}</p>
                      <Note>
                        {entry.author || labels["leads.read_only"]} ·{" "}
                        {stamp(entry.createdAt)}
                      </Note>
                    </li>
                  ))}
                </ol>
                {detail.editable && (
                  <div className="console-lead-note-form">
                    <Textarea
                      className="console-lead-note-input"
                      value={note}
                      rows={3}
                      maxLength={2000}
                      placeholder={labels["leads.note.placeholder"]}
                      aria-label={labels["leads.note.placeholder"]}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <Button
                      variant="primary"
                      loading={busy}
                      disabled={note.trim() === ""}
                      onClick={() => void addNote()}
                    >
                      {labels["leads.note.add"]}
                    </Button>
                  </div>
                )}
              </section>

              {/* Where the request came from: worth having, rarely needed, so it folds. */}
              <details className="console-lead-context">
                <summary>{labels["leads.section.context"]}</summary>
                <dl className="console-lead-meta">
                  <dt>{labels["leads.field.source"]}</dt>
                  <dd>{sourceName(detail.source, labels)}</dd>
                  <dt>{labels["leads.field.locale"]}</dt>
                  <dd>{detail.locale === "en" ? "English" : "العربية"}</dd>
                  <dt>{labels["leads.field.created"]}</dt>
                  <dd>
                    <time dateTime={detail.createdAt}>
                      {stamp(detail.createdAt)}
                    </time>
                  </dd>
                  {detail.pagePath && (
                    <>
                      <dt>{labels["leads.field.page"]}</dt>
                      <dd>{detail.pagePath}</dd>
                    </>
                  )}
                  {detail.referrer && (
                    <>
                      <dt>{labels["leads.field.referrer"]}</dt>
                      <dd>{detail.referrer}</dd>
                    </>
                  )}
                  {detail.utm && Object.keys(detail.utm).length > 0 && (
                    <>
                      <dt>{labels["leads.field.campaign"]}</dt>
                      <dd>{Object.values(detail.utm).join(" · ")}</dd>
                    </>
                  )}
                </dl>
              </details>
            </>
          )}
        </section>
      </div>

      {/* Narrow screens only (the stylesheet hides it above 1024px): a click outside the
          sheet closes it. Not focusable, because Esc and the back button already do this. */}
      {sheet && (
        <button
          type="button"
          className="console-lead-scrim"
          aria-hidden="true"
          tabIndex={-1}
          onClick={dismiss}
        />
      )}

      {notice && (
        <div className="console-leads-toast" data-tone={notice.tone}>
          <Alert tone={notice.tone}>{labels[notice.key]}</Alert>
        </div>
      )}
    </div>
  );
}
