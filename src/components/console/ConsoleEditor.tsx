'use client';

/**
 * One row, edited: the fields on the left, what they will look like and what a search
 * engine will say they look like on the right, and the lifecycle actions pinned to the
 * bottom of the pane.
 *
 * It owns the whole editing session for one row — the document, the form derived from
 * it, the autosave, the field messages, the preview — and nothing else. Which row is
 * open, which list or language tab is showing and what the URL says belong to
 * `ContentWorkspace`, because the list and the URL are the same object and the row is
 * not. The two meet at the unsaved-changes gate: the workspace asks to go somewhere,
 * this pane says whether the form is dirty, and only it can save or discard what it
 * holds.
 *
 * Five behaviours are worth the reading, because every one was chosen against a failure:
 *
 * **Autosave writes the draft and never publishes.** A row that saves itself is a row
 * that cannot lose ten minutes of Arabic because a browser closed; a row that *publishes*
 * itself is a copy editor's worst nightmare. So it is one PATCH on the same guarded
 * route the button uses, and the moment the answer is `stale_row` it stops for that row —
 * two people writing one document is not a race to win every two seconds.
 *
 * **Publish saves first** when the form is dirty. The API publishes the draft the
 * database holds, so a button that only published would quietly put yesterday's words on
 * the site while the person looked at today's.
 *
 * **A field message belongs under the field, and only while that field still holds the
 * value it was written for.** `parseWrites()` answers with `{ path, message }`, and the
 * browser's own parse answers in the same words, so one box can be marked whether MariaDB
 * or the keystroke refused it. A server message left standing over a value that has since
 * been corrected is a lie about what is on the screen.
 *
 * **The body is previewed inside `sandbox=""`.** No origin, no scripts, no top-level
 * navigation — which is what makes it safe to hand the frame the HTML exactly as it was
 * typed, instead of bundling the site's Node-only sanitizer into the console.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { consoleCall, consoleRead } from './client-api';
import { fieldOf, groupIssues, liveIssues, type TrackedIssue } from '@/lib/console/issues';
import { contentStateKey, contentStateTone, fieldsFromForm, formOf, isPendingIn, sameForm, type Form } from '@/lib/console/editor-form';
import { previewDocument, previewModel, seoReadout } from '@/lib/console/preview';
import { writeScopeQuery } from '@/lib/content/list-view';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { Alert, Badge, Empty, Note, Skeleton, type Tone } from '@/components/ui/Status';
import type { ContentAbilities, ContentScope } from '@/lib/console/content-screen';
import type { ContentKind, ContentLocale } from '@/lib/content/kinds';
import type { ContentRow, FieldView } from '@/lib/content/store';
import type { RevisionView } from '@/lib/content/publish';
import type { MessageKey } from '@/lib/console/messages';

/** Long enough that a pause mid-sentence is not a write; short enough to feel automatic. */
const AUTOSAVE_MS = 2000;
/** The frame reloads on its own clock, so the preview does not blink every keystroke. */
const PREVIEW_MS = 450;

export interface ConsoleEditorProps {
  kind: ContentKind;
  /** `/api/console/content/<kind>`, the same path the list posts its bulk actions to */
  api: string;
  /** which dimension a write names: the language tab, or the list the row belongs to */
  scopeValue: ContentScope;
  named: boolean;
  locale: ContentLocale;
  rowId: string | null;
  labels: Record<MessageKey, string>;
  abilities: ContentAbilities;
  /** the publish scopes already narrowed to this screen's list */
  publishable: ContentScope[];
  /** the workspace wants to go somewhere, and this pane has to let go of the form first */
  pendingNav: boolean;
  onRequestNav: (run: () => void) => void;
  onPendingResolve: () => void;
  onPendingCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** the list re-reads itself after anything that moved a row */
  onChanged: () => void;
  /** drop this row: the workspace clears the selection, because the selection is its */
  onClose: () => void;
}

type Notice = { tone: Tone; key: MessageKey };

export function ConsoleEditor({
  kind,
  api,
  scopeValue,
  named,
  locale,
  rowId,
  labels,
  abilities,
  publishable,
  pendingNav,
  onRequestNav,
  onPendingResolve,
  onPendingCancel,
  onDirtyChange,
  onChanged,
  onClose,
}: Readonly<ConsoleEditorProps>) {
  /** The document, tagged with the read it came from: `id#nonce`. A save refreshes the row
   *  under the same tag, which is what keeps the form — and the caret — where they are. */
  const [doc, setDoc] = useState<{ tag: string; row: ContentRow | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [form, setForm] = useState<Form>({});
  /** The values this pane last had from the server, in the shape the person typed them. */
  const [savedForm, setSavedForm] = useState<Form>({});
  const [formKey, setFormKey] = useState('');
  const [serverIssues, setServerIssues] = useState<TrackedIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [autosavedAt, setAutosavedAt] = useState<number | null>(null);
  const [autosaveStopped, setAutosaveStopped] = useState(false);
  const [history, setHistory] = useState<{ id: string; revisions: RevisionView[] } | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');

  const tag = rowId === null ? '' : `${rowId}#${nonce}`;
  /** A reply to the row someone switched away from must not draw over the one they are on,
   *  so the row is only ever read under the tag of the row that is open. */
  const row = doc === null || doc.tag !== tag ? null : doc.row;
  const loading = rowId !== null && doc?.tag !== tag;

  const writable = abilities.update.includes(scopeValue);
  const canEditRow = row !== null && writable && !row.trashed && !loading;
  const query = writeScopeQuery({ listKey: named ? String(scopeValue) : null, locale });

  // A fresh read — a new row, a new tab, a rollback — owns the form. A save that came
  // back under the same tag does not: it answers with the row the database holds, and the
  // words the person is still typing stay where they are.
  if (row && formKey !== `${tag}.${locale}`) {
    const base = formOf(row, locale);
    setFormKey(`${tag}.${locale}`);
    setForm(base);
    setSavedForm(base);
    setServerIssues([]);
    setAutosaveStopped(false);
    setNotice(null);
  }
  if (rowId === null && formKey !== '') setFormKey('');

  useEffect(() => {
    if (!rowId) return;
    let alive = true;
    const want = `${rowId}#${nonce}`;
    void (async () => {
      const result = await consoleRead<{ row?: ContentRow }>(`${api}/${rowId}`);
      if (!alive) return;
      setDoc({ tag: want, row: result.data?.row ?? null });
      if (!result.data?.row) setNotice({ tone: 'danger', key: 'content.error.not_found' });
    })();
    return () => {
      alive = false;
    };
  }, [api, rowId, nonce]);

  const parsed = useMemo(() => (row ? fieldsFromForm(row, form) : { fields: {}, issues: [] }), [row, form]);
  const dirty = row !== null && !sameForm(form, savedForm);
  // A server message is dropped as soon as the value it was written for is gone: corrected
  // text under a red box reads as a bug in the box, not as advice.
  const issues = useMemo(
    () => groupIssues(labels, [...parsed.issues, ...liveIssues(serverIssues, form)], Object.keys(row?.fields ?? {})),
    [form, labels, parsed, row, serverIssues],
  );
  // Only the browser's own complaints grey the buttons: a server message is often about
  // something the client cannot recompute — a taken slug, a moved version — and needs a retry.
  const invalid = parsed.issues.length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const tell = useCallback(
    (result: { status: number; error: string | null }, ok: MessageKey): void => {
      if (result.error) {
        const mapped = `content.error.${result.error}` as MessageKey;
        setNotice({ tone: 'danger', key: labels[mapped] ? mapped : 'content.error.save' });
        return;
      }
      setNotice({ tone: 'ok', key: ok });
    },
    [labels],
  );

  /** The draft only. `mode` decides how loud a failure is allowed to be. */
  const save = useCallback(async (mode: 'manual' | 'auto' | 'nav'): Promise<boolean> => {
    if (!row) return false;
    const posted = form;
    if (invalid) {
      if (mode !== 'auto') setNotice({ tone: 'danger', key: 'content.error.invalid_input' });
      return false;
    }
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}${query}`, 'PATCH', { fields: parsed.fields, version: row.version });
    setBusy(false);
    if (result.error) {
      setServerIssues(result.issues.map((issue) => ({ ...issue, was: String(posted[fieldOf(issue.path)] ?? '') })));
      if (result.error === 'stale_row') setAutosaveStopped(true);
      if (mode === 'auto') setNotice(result.error === 'stale_row' ? { tone: 'danger', key: 'content.autosave_stopped' } : null);
      else tell(result, 'content.saved');
      return false;
    }
    setServerIssues([]);
    setSavedForm(posted);
    if (result.data?.row) setDoc({ tag, row: result.data.row });
    if (mode === 'auto') setAutosavedAt(Date.now());
    else setNotice({ tone: 'ok', key: 'content.saved' });
    onChanged();
    return true;
  }, [api, form, invalid, onChanged, parsed, query, row, tag, tell]);

  // The debounce is the whole design: one write per pause, and a keystroke cancels it.
  useEffect(() => {
    if (!canEditRow || !dirty || invalid || autosaveStopped || busy || pendingNav) return;
    const timer = setTimeout(() => void save('auto'), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [autosaveStopped, busy, canEditRow, dirty, invalid, pendingNav, save]);

  useEffect(() => {
    const timer = setTimeout(() => setPreviewSrc(previewDocument(previewModel(kind, form, locale), locale)), PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [form, kind, locale]);

  async function publish(): Promise<void> {
    if (!row) return;
    if (dirty && !(await save('nav'))) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}/publish${query}`, 'POST', {
      locales: named ? undefined : publishable,
    });
    setBusy(false);
    tell(result, 'content.published');
    if (result.data?.row) setDoc({ tag, row: result.data.row });
    onChanged();
  }

  async function moveToTrash(): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleCall(`${api}/${row.id}${query}`, 'DELETE', { trashed: true });
    setBusy(false);
    tell(result, 'content.trashed');
    onChanged();
  }

  async function restore(): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}/restore${query}`, 'POST', {});
    setBusy(false);
    tell(result, 'content.restored');
    if (result.data?.row) setDoc({ tag, row: result.data.row });
    onChanged();
  }

  async function openHistory(): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleRead<{ revisions?: RevisionView[] }>(`${api}/${row.id}/revisions${query}`);
    setBusy(false);
    setHistory({ id: row.id, revisions: result.data?.revisions ?? [] });
    if (!result.data?.revisions) setNotice({ tone: 'danger', key: 'content.load_failed' });
  }

  /** A rollback writes the draft, so it needs the same version dance a save does; the
   *  nonce then makes the pane re-read, because the row underneath the form changed. */
  async function rollback(revision: number): Promise<void> {
    if (!row) return;
    setBusy(true);
    const result = await consoleCall(`${api}/${row.id}/rollback${query}`, 'POST', { revision });
    setBusy(false);
    tell(result, 'content.rolled_back');
    setHistory(null);
    setNonce((current) => current + 1);
    onChanged();
  }

  /** The one keyboard shortcut an editor should never have to look up. */
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canEditRow && !busy) void save('manual');
        return;
      }
      if (event.key !== 'Escape') return;
      if (pendingNav) onPendingCancel();
      else if (history) setHistory(null);
      else if (row) onRequestNav(onClose);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, canEditRow, history, onClose, onPendingCancel, onRequestNav, pendingNav, row, save]);

  async function continueAfterSave(): Promise<void> {
    if (await save('nav')) onPendingResolve();
  }

  if (!rowId) return <Empty>{labels['content.pick_row']}</Empty>;

  const model = previewModel(kind, form, locale);
  const state = row ? contentStateKey(row) : null;
  const other: ContentLocale = locale === 'ar' ? 'en' : 'ar';
  const bilingual = kind !== 'list_item';
  const titleName = kind === 'offer' ? 'name' : 'title';
  // A page has no teaser column, so its description falls back to the heading — exactly
  // what `publicSeo()` does when it is handed `{ ar: '', en: '' }`.
  const introName = kind === 'article' || kind === 'offer' ? 'excerpt' : '';
  const seo = row
    ? seoReadout({
        kind,
        key: row.key,
        listKey: named ? String(scopeValue) : undefined,
        locale,
        title: bilingual ? String(form[titleName] ?? '') : model.title,
        otherTitle: bilingual ? (row.fields[titleName]?.draft?.[other] ?? '') : model.title,
        description: bilingual && introName ? String(form[introName] ?? '') : model.intro,
        otherDescription: bilingual && introName ? (row.fields[introName]?.draft?.[other] ?? '') : model.intro,
      })
    : null;

  return (
    <div className="console-editor">
      <div className="console-editor-main">
        <header className="console-work-head">
          <h2>{row?.key ?? rowId}</h2>
          {state && <Badge tone={contentStateTone(state)}>{labels[state]}</Badge>}
          {dirty && <Badge tone="warn">{labels['content.dirty']}</Badge>}
          <Button onClick={() => onRequestNav(onClose)}>{labels['content.close']}</Button>
          <Note>
            {/* Each date is its own bidi run: an ISO date typed straight into an Arabic
                sentence gets its digits reordered — `2026-10-23` read as `26-10-2026`. */}
            {row ? (
              <>
                {labels['content.version']} {row.version} ·{' '}
                {row.publishedAt ? (
                  <>
                    {labels['content.published_at']}: <bdi>{row.publishedAt.slice(0, 10)}</bdi> ·{' '}
                  </>
                ) : (
                  <>
                    {labels['content.no_history']} ·{' '}
                  </>
                )}
                {labels['content.updated_at']}: <bdi>{row.updatedAt.slice(0, 10)}</bdi>
              </>
            ) : null}
          </Note>
        </header>

        {loading && <Skeleton rows={3} label={labels['content.loading']} />}

        {row?.trashed ? (
          <Alert tone="danger">{labels['content.state.trashed']}</Alert>
        ) : row && !writable ? (
          <Alert>{labels[abilities.update.length === 0 ? 'content.readonly' : 'content.locale_locked']}</Alert>
        ) : null}

        {issues.other.length > 0 && <Alert tone="danger">{issues.other.join(' · ')}</Alert>}

        {row && (
          <div className="ui-fields">
            {Object.entries(row.fields).map(([name, field]) => (
              <FieldRow
                key={name}
                name={name}
                field={field}
                locale={locale}
                value={form[name]}
                errors={issues.byField[name] ?? []}
                disabled={!canEditRow}
                labels={labels}
                onChange={(next) => setForm((current) => ({ ...current, [name]: next }))}
              />
            ))}
          </div>
        )}

        {/* The bar is pinned to the bottom of the pane: the actions are the reason the
            pane is open, and on a phone they must not be forty keystrokes below the text. */}
        <div className="console-editor-bar console-controls">
          <Button variant="primary" loading={busy} disabled={!canEditRow || !dirty || invalid} onClick={() => void save('manual')}>
            {busy ? labels['content.saving'] : labels['content.save']}
          </Button>
          {publishable.length > 0 && row && !row.trashed && (
            <Button onClick={() => void publish()} disabled={busy || !writable || invalid}>
              {labels['content.publish']}
            </Button>
          )}
          {row && abilities.remove.includes(scopeValue) && !row.trashed && (
            <Button variant="danger" onClick={() => onRequestNav(() => void moveToTrash())} disabled={busy}>
              {labels['content.trash_item']}
            </Button>
          )}
          {row?.trashed && abilities.update.includes(scopeValue) && (
            <Button onClick={() => void restore()} disabled={busy}>
              {labels['content.restore']}
            </Button>
          )}
          <Button onClick={() => void openHistory()} disabled={busy || !row}>{labels['content.history']}</Button>
          {/* The save state is one of four things and the tone is the part the eye reads
              first: red for stopped, champagne for "not written yet", green for "written". */}
          <Note className="console-count" tone={autosaveStopped || invalid ? 'danger' : dirty ? 'warn' : autosavedAt !== null ? 'ok' : 'neutral'}>
            {autosaveStopped
              ? labels['content.autosave_stopped']
              : invalid
                ? labels['content.error.invalid_input']
                : dirty
                  ? labels['content.autosave']
                  : autosavedAt !== null
                    ? labels['content.autosaved']
                    : labels['content.keyboard']}
          </Note>
        </div>

        {pendingNav && (
          <div className="console-panel console-nav-confirm" role="alertdialog" aria-label={labels['content.unsaved.title']}>
            <p className="console-lede">{labels['content.unsaved.body']}</p>
            <div className="console-controls">
              <Button variant="primary" loading={busy} onClick={() => void continueAfterSave()}>
                {labels['content.unsaved.save']}
              </Button>
              <Button
                onClick={() => {
                  setForm(savedForm);
                  setSavedForm(savedForm);
                  onPendingResolve();
                }}
                disabled={busy}
              >
                {labels['content.unsaved.discard']}
              </Button>
              <Button onClick={onPendingCancel}>{labels['content.unsaved.keep']}</Button>
            </div>
          </div>
        )}

        {history && row && history.id === row.id && (
          <div className="console-panel console-history">
            {history.revisions.length === 0 ? (
              <Empty>{labels['content.no_history']}</Empty>
            ) : (
              <ul className="console-rows">
                {history.revisions.map((revision) => (
                  <li key={revision.id} className="console-revision">
                    <span>
                      #{revision.revision} · {revision.createdAt.slice(0, 16).replace('T', ' ')} · {revision.authorEmail}
                      {revision.note ? ` · ${revision.note}` : ''}
                    </span>
                    {publishable.length > 0 && (
                      <Button size="sm" onClick={() => void rollback(revision.revision)} disabled={busy}>
                        {labels['content.rollback']}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => setHistory(null)}>{labels['content.close']}</Button>
          </div>
        )}

        {notice && <Alert tone={notice.tone}>{labels[notice.key]}</Alert>}
      </div>

      <aside className="console-editor-side">
        <section className="console-panel console-preview">
          <h3>{labels['content.preview']}</h3>
          <Note>{labels['content.preview.draft']}</Note>
          {seo?.path ? (
            <ButtonLink href={seo.path} target="_blank" rel="noreferrer">
              {labels['content.preview.site']}
            </ButtonLink>
          ) : (
            <Note>{labels['content.preview.no_page']}</Note>
          )}
          {/* No `allow-same-origin`, no `allow-scripts`: the draft's own markup is inert
              here, and it never reaches the document that holds the session cookie. */}
          <iframe className="console-preview-frame" title={labels['content.preview']} sandbox="" srcDoc={previewSrc} />
        </section>

        <section className="console-panel console-seo">
          <h3>{labels['content.seo']}</h3>
          {seo ? (
            <>
              <p className="console-seo-title">{seo.title || labels['content.seo.none']}</p>
              {seo.path && <p className="console-seo-path">{seo.path}</p>}
              <p className="console-seo-desc">{seo.description}</p>
              <Note>
                {labels['content.seo.title']}: {labels['content.seo.count'].replace('{n}', String(seo.titleLength))} ·{' '}
                {labels['content.seo.description']}: {labels['content.seo.count'].replace('{n}', String(seo.descriptionLength))}
              </Note>
            </>
          ) : (
            // Not a skeleton: three wells of row-height would not be the shape of what is
            // coming here, which is a sentence. The word is the honest placeholder.
            <Note>{labels['content.loading']}</Note>
          )}
        </section>
      </aside>
    </div>
  );
}

function FieldRow({
  name,
  field,
  locale,
  value,
  errors,
  disabled,
  labels,
  onChange,
}: Readonly<{
  name: string;
  field: FieldView;
  locale: ContentLocale;
  value: string | boolean | undefined;
  errors: string[];
  disabled: boolean;
  labels: Record<MessageKey, string>;
  onChange: (next: string | boolean) => void;
}>) {
  const label = labels[`content.field.${name}` as MessageKey] ?? name;
  const id = `field-${name}`;
  const invalid = errors.length > 0;

  if (field.kind === 'flag') {
    return (
      <div className="ui-field">
        {/* The box and its words are one target: `Checkbox` renders the label around the
            input, which is what gives a flag the 44px row the list's checkboxes already had
            and this one did not. */}
        <Checkbox id={id} label={label} checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        {/* A checkbox reads the same at a glance whether it is on or off; the words do not. */}
        <Note>
          {value ? labels['content.flag.on'] : labels['content.flag.off']}
          {field.immediate ? ` · ${labels['content.immediate']}` : ''}
        </Note>
      </div>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const pending = !disabled && !invalid && (field.kind === 'bi' ? isPendingIn(field, locale) : field.pending);

  return (
    <Field
      htmlFor={id}
      errors={errors}
      note={field.immediate && !invalid ? <Note>{labels['content.immediate']}</Note> : null}
      label={
        <>
          {label}
          {field.kind === 'bi' ? <span className="ui-label-note">{labels[`content.locale.${locale}` as MessageKey]}</span> : null}
          {pending ? <Badge tone="warn">{labels['content.state.pending']}</Badge> : null}
        </>
      }
    >
      {field.multiline ? (
        <Textarea
          id={id}
          rows={field.kind === 'bi' && name === 'content' ? 14 : 6}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={field.kind === 'number' ? 'number' : 'text'}
          value={text}
          disabled={disabled}
          maxLength={field.max > 0 && field.max < 100_000 ? field.max : undefined}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
