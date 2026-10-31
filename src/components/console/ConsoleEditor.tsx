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
import { fieldOf, formValueOf, groupIssues, liveIssues, type TrackedIssue } from '@/lib/console/issues';
import {
  contentStateKey,
  contentStateTone,
  displayForm,
  fieldsFromForm,
  formOf,
  isPendingIn,
  listSchemaOfRow,
  resultNotices,
  sameForm,
  sharedAltMove,
  storedValue,
  type Form,
} from '@/lib/console/editor-form';
import { isSharedAltKey } from '@/lib/content/alt-migration';
import { listDocFromForm, listDocImage, schemaStems } from '@/lib/content/list-schema';
import { ListDocFields, type ReferenceChoice } from './ListDocFields';
import { CaseComparePreview } from './CaseComparePreview';
import { previewDocument, previewModel, type ResultCasePreview } from '@/lib/console/preview';
import { localizedPath } from '@/lib/content/paths';
import { writeScopeQuery } from '@/lib/content/list-view';
import { Button, ButtonLink } from '@/components/console/kit';
import { Checkbox, Field, Input, Textarea } from '@/components/console/kit';
import { Card } from '@/components/console/kit';
import { Alert, Badge, Empty, Note, Skeleton, type Tone } from '@/components/console/kit';
import { ImageGallery } from './ImageGallery';
import { ImagePicker } from './ImagePicker';
import { RichEditor } from './RichEditor';
import { SeoPanel } from './SeoPanel';
import { imageSlots, isImageField, isImageGalleryField, looksLikeImage } from '@/lib/console/image-field';
import type { ContentAbilities, ContentScope } from '@/lib/console/content-screen';
import type { EntitySeo } from '@/lib/console/seo-center';
import { isOrderedKind, type ContentKind, type ContentLocale } from '@/lib/content/kinds';
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
  /** the row the server already read: the form starts full instead of flashing empty */
  initialRow?: ContentRow | null;
  labels: Record<MessageKey, string>;
  abilities: ContentAbilities;
  /** the publish scopes already narrowed to this screen's list */
  publishable: ContentScope[];
  /** the row's search result and what this role may write there */
  seo: EntitySeo & { writable: boolean };
  /** the names a `refs` field may point at, resolved on the server */
  referenceOptions: Record<string, ReferenceChoice[]>;
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
  initialRow = null,
  labels,
  abilities,
  publishable,
  seo,
  referenceOptions,
  pendingNav,
  onRequestNav,
  onPendingResolve,
  onPendingCancel,
  onDirtyChange,
  onChanged,
  onClose,
}: Readonly<ConsoleEditorProps>) {
  /** The document, tagged with the read it came from: `id#nonce`. A save refreshes the row
   *  under the same tag, which is what keeps the form — and the caret — where they are.
   *  The server hands the row over on the detail page, so the first paint holds it. */
  const [doc, setDoc] = useState<{ tag: string; row: ContentRow | null } | null>(() =>
    initialRow && rowId !== null && initialRow.id === rowId ? { tag: `${rowId}#0`, row: initialRow } : null,
  );
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
  /** The case the same form draws its comparison from, kept beside the frame because the
   *  frame runs no scripts and a slider needs them. */
  const [previewCase, setPreviewCase] = useState<ResultCasePreview | null>(null);

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
    // Nonce zero is the server's read: the document is already in `doc`, and fetching it
    // again would only make the form flash the values it is supposed to start with.
    if (nonce === 0 && initialRow?.id === rowId) return;
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
  }, [api, initialRow, rowId, nonce]);

  const parsed = useMemo(() => (row ? fieldsFromForm(row, form) : { fields: {}, issues: [] }), [row, form]);
  /** The typed form a list item gets; `null` for a bilingual kind or an older list. */
  const listSchema = row ? listSchemaOfRow(row) : null;
  /**
   * The row's legacy shared picture description, and the form that has already moved it.
   *
   * Pure, so this is the same object the notice's button hands to the save. `nothing` means
   * there is no such key — or the list has no such split to move onto.
   */
  const altMove = useMemo(() => sharedAltMove(listSchema, form), [form, listSchema]);
  const altOwned = altMove.status !== 'nothing';
  // The notice warns only while the move is still on offer. A row whose two descriptions are
  // already written needs no colour shouted at it, so the same box goes quiet.
  const altTone: Tone = altMove.status === 'moved' ? 'warn' : 'neutral';
  // What the pane shows on the right is the cleaned document, not the raw keystrokes:
  // an imported `<p>` in a plain box must not become a visible tag in the preview or a
  // `<p>` counted into the SEO description's length.
  const shown = useMemo(() => (row ? displayForm(row, form) : form), [row, form]);
  const dirty = row !== null && !sameForm(form, savedForm);
  // A server message is dropped as soon as the value it was written for is gone: corrected
  // text under a red box reads as a bug in the box, not as advice.
  const issues = useMemo(
    () =>
      groupIssues(
        labels,
        // The shared description is said once, by the notice that fixes it — not also as an
        // unnamed error underneath. Every other message keeps its own route to the field it
        // belongs to, because a notice about one key is not a licence to hide the rest.
        [...parsed.issues, ...liveIssues(serverIssues, form)].filter((issue) => !altOwned || !isSharedAltKey(issue.path)),
        // A list document's messages are named by the schema's stems (`name`, `benefits`),
        // not by the row's single `data` field, so the message lands under its own box.
        listSchema ? schemaStems(listSchema) : Object.keys(row?.fields ?? {}),
      ),
    [altOwned, form, labels, listSchema, parsed, row, serverIssues],
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

  /**
   * The draft only. `mode` decides how loud a failure is allowed to be, and `next` saves a
   * form the person has not typed into the boxes — the one-click move's own result.
   *
   * Both go through this one path so the version lock, the field messages and the failure
   * reporting stay one behaviour: a move that the database refused has to be reported as a
   * failed save, because its words are still only in the browser.
   */
  const save = useCallback(
    async (mode: 'manual' | 'auto' | 'nav', next?: Form): Promise<boolean> => {
      if (!row) return false;
      const posted = next ?? form;
      const target = next ? fieldsFromForm(row, next) : parsed;
      if (target.issues.length > 0) {
        if (mode !== 'auto') setNotice({ tone: 'danger', key: 'content.error.invalid_input' });
        return false;
      }
      setBusy(true);
      const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}${query}`, 'PATCH', { fields: target.fields, version: row.version });
      setBusy(false);
      if (result.error) {
        setServerIssues(result.issues.map((issue) => ({ ...issue, was: formValueOf(posted, fieldOf(issue.path)) })));
        if (result.error === 'stale_row') setAutosaveStopped(true);
        if (mode === 'auto') setNotice(result.error === 'stale_row' ? { tone: 'danger', key: 'content.autosave_stopped' } : null);
        else tell(result, 'content.saved');
        return false;
      }
      setServerIssues([]);
      setSavedForm(posted);
      if (result.data?.row) setDoc({ tag, row: result.data.row });
      if (mode === 'auto') setAutosavedAt(Date.now());
      else {
        setNotice({ tone: 'ok', key: 'content.saved' });
        // An explicit save is the moment to ask the screen behind the editor for its dates
        // and state chip again. Autosave stays inside the form; re-rendering the page every
        // two seconds would undo more than it refreshes.
        onChanged();
      }
      return true;
    },
    [api, form, onChanged, parsed, query, row, tag, tell],
  );

  /** One click: split the shared description, then let the ordinary save report the write. */
  async function moveSharedAlt(): Promise<void> {
    if (!canEditRow || altMove.status !== 'moved') return;
    setForm(altMove.form);
    if (await save('manual', altMove.form)) setNotice({ tone: 'ok', key: 'content.alt.moved' });
  }

  // The debounce is the whole design: one write per pause, and a keystroke cancels it.
  useEffect(() => {
    if (!canEditRow || !dirty || invalid || autosaveStopped || busy || pendingNav) return;
    const timer = setTimeout(() => void save('auto'), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [autosaveStopped, busy, canEditRow, dirty, invalid, pendingNav, save]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const model = previewModel(kind, shown, locale, row?.listKey ?? null, referenceOptions);
      setPreviewSrc(previewDocument(model, locale, labels));
      setPreviewCase(model.resultCase);
    }, PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [kind, locale, row?.listKey, shown, referenceOptions, labels]);

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
    const result = await consoleCall<{ row?: ContentRow }>(`${api}/${row.id}${query}`, 'DELETE', { trashed: true });
    setBusy(false);
    tell(result, 'content.trashed');
    if (result.data?.row) setDoc({ tag, row: result.data.row });
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

  const model = previewModel(kind, shown, locale, row?.listKey ?? null);
  const media = row ? imagesOfForm(row, shown) : [];
  const state = row ? contentStateKey(row) : null;
  const previewPath = seo.path === null ? null : localizedPath(seo.path, locale);

  return (
    <div className="console-editor">
      <div className="console-editor-main">
        <div className="console-detail-status console-controls">
          {state && <Badge tone={contentStateTone(state)}>{labels[state]}</Badge>}
          {dirty && <Badge tone="warn">{labels['content.dirty']}</Badge>}
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
        </div>

        {loading && <Skeleton rows={3} label={labels['content.loading']} />}

        {row?.trashed ? (
          <Alert tone="danger">{labels['content.state.trashed']}</Alert>
        ) : row && !writable ? (
          <Alert>{labels[abilities.update.length === 0 ? 'content.readonly' : 'content.locale_locked']}</Alert>
        ) : null}

        {/* One row, one shared sentence: the notice that names it is the one that fixes it.
            Before this, the key arrived as an unnamed red box reading "that field is not part
            of this kind", with no action except a Remove that threw the words away — so the
            row could not be saved and its description could not be kept. Anything else the
            document holds still reaches the block below, unchanged. */}
        {altOwned && row ? (
          <Alert tone={altTone}>
            {labels[altMove.status === 'moved' ? 'content.alt.can_move' : 'content.alt.both_filled']}
            {altMove.status === 'moved' ? (
              <>
                {' '}
                <Button size="sm" disabled={!canEditRow || busy} onClick={() => void moveSharedAlt()}>
                  {labels['content.alt.move']}
                </Button>
              </>
            ) : null}
          </Alert>
        ) : null}

        {issues.other.length > 0 && (
          <Alert tone="danger">
            <strong>{labels['content.issues.other']}</strong> {issues.other.join(' · ')}
          </Alert>
        )}

        {/* A result row is the one list item that is really something else — a journal article
            — and two of its states look fine while changing nothing on the site. Said out loud
            here, because a page that silently drops what an owner typed is the defect. */}
        {row && listSchema?.key === 'results' && !row.trashed ? (
          <ResultAdvice form={shown} rowKey={row.key} labels={labels} />
        ) : null}

        {/* The picture is part of the item, not a detail of the list: whatever URL the
            image field (or a list item's `data`) holds is shown here as the person types
            it, so a broken path is visible before it reaches the site. */}
        {media.length > 0 && (
          <section className="console-media" aria-label={labels['content.media']}>
            <h3>{labels['content.media']}</h3>
            <ul className="console-media-list">
              {media.map((src) => (
                <li key={src}>
                  {/* The address comes from the document (a WordPress path, a CDN, a data
                      URL), so it is not a host `next/image` could be configured with. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" width={120} height={90} loading="lazy" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {row && (
          <div className="console-fields">
            {listSchema ? (
              <ListDocFields
                schema={listSchema}
                form={form}
                errors={issues.byField}
                referenceOptions={referenceOptions}
                locale={locale}
                disabled={!canEditRow}
                labels={labels}
                onChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
              />
            ) : row.kind === 'list_item' ? (
              <Alert>{labels['content.list.no_form']}</Alert>
            ) : null}
            {Object.entries(row.fields)
              .filter(([, field]) => !(row.kind === 'list_item' && field.kind === 'json'))
              // The order is set with the arrows on the list, never with a number in a box. Typing
              // one meant reading every other row's number to work out what was free — and two
              // rows given the same number share a place, so a list could reorder itself on reload.
              .filter(([name]) => !(name === 'position' && isOrderedKind(row.kind)))
              .map(([name, field]) => (
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
          <Card className="console-panel console-nav-confirm" role="alertdialog" aria-label={labels['content.unsaved.title']}>
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
          </Card>
        )}

        {history && row && history.id === row.id && (
          <Card className="console-panel console-history">
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
          </Card>
        )}

        {notice && <Alert tone={notice.tone}>{labels[notice.key]}</Alert>}
      </div>

      <aside className="console-editor-side">
        {previewCase && <CaseComparePreview model={previewCase} locale={locale} labels={labels} />}
        <Card as="section" className="console-panel console-preview">
          <h3>{labels['content.preview']}</h3>
          <Note>{labels['content.preview.draft']}</Note>
          {previewPath ? (
            <ButtonLink href={previewPath} target="_blank" rel="noreferrer">
              {labels['content.preview.site']}
            </ButtonLink>
          ) : (
            <Note>{labels['content.preview.no_page']}</Note>
          )}
          {/* No `allow-same-origin`, no `allow-scripts`: the draft's own markup is inert
              here, and it never reaches the document that holds the session cookie. */}
          <iframe className="console-preview-frame" title={labels['content.preview']} sandbox="" srcDoc={previewSrc} />
        </Card>

        <SeoPanel
          key={`${seo.path ?? 'none'}:${locale}`}
          path={seo.path}
          locale={locale}
          inherited={seo.inherited}
          override={seo.override}
          writable={seo.writable}
          labels={labels}
          rowLabel={model.title}
        />
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
    // A checkbox reads the same at a glance whether it is on or off; the words do not. The one
    // box that decides whether a visitor sees the row says so in those terms, and says what
    // pressing it does not do — an owner who hides a result to try a layout must be able to
    // trust that its pictures and its text are still there.
    const words = name === 'enabled' ? (value ? labels['content.visibility.on'] : labels['content.visibility.off']) : value ? labels['content.flag.on'] : labels['content.flag.off'];
    return (
      <div className="console-field">
        {/* The box and its words are one target: `Checkbox` renders the label around the
            input, which is what gives a flag the 44px row the list's checkboxes already had
            and this one did not. */}
        <Checkbox id={id} label={label} checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        <Note>
          {words}
          {field.immediate ? ` · ${labels['content.immediate']}` : ''}
        </Note>
      </div>
    );
  }

  const text = typeof value === 'string' ? value : '';
  const pending = !disabled && !invalid && (field.kind === 'bi' ? isPendingIn(field, locale) : field.pending);
  // A plain box keeps the person's keystrokes while they type and loses its markup when
  // they leave it — the same `plainText()` the server runs, so the box ends up saying
  // exactly what the site will read. Cleaning on every keystroke would eat the space they
  // just typed and undo `12 < 15`.
  const leaveField = (): void => {
    const stored = storedValue(field, text);
    if (stored !== text) onChange(stored);
  };

  const labelNode = (
    <>
      {label}
      {field.kind === 'bi' ? <span className="console-label-note">{labels[`content.locale.${locale}` as MessageKey]}</span> : null}
      {pending ? <Badge tone="warn">{labels['content.state.pending']}</Badge> : null}
    </>
  );

  // BK-14a: a picture is chosen from the disk, never typed. The row keeps its label and its
  // `id` — the id now belongs to the file input the picker stretches over the frame — so the
  // `<label>` still names a real control and a keyboard reaches the upload the same way it
  // reached the box it replaced.
  if (isImageField(name, field)) {
    return (
      <Field htmlFor={id} errors={errors} label={labelNode} note={field.immediate && !invalid ? <Note>{labels['content.immediate']}</Note> : null}>
        <ImagePicker labels={labels} value={text} disabled={disabled} inputId={id} onChange={(next) => onChange(next)} />
      </Field>
    );
  }

  // An offer's `images` is pictures and nothing else: a text area over it would be a place
  // to type an address by hand, which is the thing the picker exists to stop. The gallery
  // owns the whole field, and an empty one still offers its add tile.
  if (isImageGalleryField(name, field)) {
    return (
      <Field htmlFor={id} errors={errors} label={labelNode} note={<Note>{labels['media.drop']}</Note>}>
        <ImageGallery
          labels={labels}
          value={text}
          disabled={disabled}
          alt={{ ar: '', en: '' }}
          inputId={id}
          onChange={onChange}
          empty={flatGallery(text) ? { path: [], srcKey: 'src' } : null}
        />
      </Field>
    );
  }

  // A document with no form is not an invitation to type JSON. Nothing reaches this line
  // today — every JSON column is a gallery or a list the console knows — but a new one has
  // to fail as a sentence on the screen, not as a textarea waiting for a paste.
  if (field.kind === 'json') {
    return <Alert>{labels['content.list.no_form']}</Alert>;
  }

  // #246. A `html` column is the only content the site prints as markup, and the only place a
  // person used to read `<p class="wp-block-paragraph">` while trying to fix a sentence. They get
  // a page instead. The row keeps the same `id`, which now names the surface they type in.
  if (field.format === 'html') {
    return (
      <Field htmlFor={id} errors={errors} label={labelNode} note={field.immediate && !invalid ? <Note>{labels['content.immediate']}</Note> : null}>
        <RichEditor
          labels={labels}
          value={text}
          disabled={disabled}
          inputId={id}
          title={label}
          rtl={locale === 'ar'}
          onChange={(next) => onChange(next)}
        />
      </Field>
    );
  }

  return (
    <Field htmlFor={id} errors={errors} label={labelNode} note={field.immediate && !invalid ? <Note>{labels['content.immediate']}</Note> : null}>
      {field.multiline ? (
        <Textarea
          id={id}
          rows={field.kind === 'bi' && name === 'content' ? 14 : 6}
          value={text}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={leaveField}
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
          onBlur={leaveField}
        />
      )}
    </Field>
  );
}

/**
 * What a result row leaves undone, printed above the fields that look filled.
 *
 * `resultNotices()` knows which states mean the row will not reach the site; this says so in
 * the language the rest of the editor speaks. The server accepts both — the schema requires
 * neither field, because the imported rows would then refuse to save — so nothing else in the
 * product tells an owner that a saved result is an invisible one.
 */
function ResultAdvice({
  form,
  rowKey,
  labels,
}: Readonly<{ form: Form; rowKey: string; labels: Record<MessageKey, string> }>) {
  return (
    <>
      {resultNotices(form, rowKey).map((key) => (
        <Alert key={key} tone="warn">
          {labels[key]}
        </Alert>
      ))}
    </>
  );
}

/** The pictures the live form would put on the site, in document order, for the strip. */
const MAX_PREVIEWS = 6;

/**
 * A gallery field that holds no pictures and whose document *is* the list.
 *
 * `{}` is what a NULL column reads as, and `[]` is what an empty gallery reads as; both can
 * take their first element. A populated object (`{ ar: [...] }`) cannot — its lists are
 * deeper, and `imageSlots()` has already found them when there are any.
 */
function flatGallery(value: string): boolean {
  const text = value.trim();
  if (text === '') return true;
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return true;
    return parsed !== null && typeof parsed === 'object' && Object.keys(parsed as Record<string, unknown>).length === 0;
  } catch {
    return false;
  }
}

export function imagesOfForm(row: ContentRow, form: Form): string[] {
  const out: string[] = [];
  const add = (src: string): void => {
    if (!out.includes(src)) out.push(src);
  };

  // A typed list's picture is in the document the form builds, not in a `data` string.
  const schema = listSchemaOfRow(row);
  if (schema) {
    const built = listDocFromForm(schema, form);
    // Every picture field, not the first one that has a value: a result story carries a
    // before *and* an after, and a strip showing one hides the half that is missing.
    for (const field of schema.fields) {
      if (field.type !== 'image') continue;
      const picture = listDocImage(schema, built.doc, field.stem);
      if (picture) add(picture);
    }
  }

  for (const [name, field] of Object.entries(row.fields)) {
    const value = form[name];
    if (field.kind === 'json') {
      if (schema) continue;
      // `data` is a list item's whole document and `images` an offer's gallery: the walk
      // finds an address wherever an image-shaped key holds one, so neither needs a name.
      try {
        for (const slot of imageSlots(JSON.parse(String(value ?? '')))) add(slot.src);
      } catch {
        // Half-typed JSON is the field's own complaint to make; a preview cannot add one.
      }
      continue;
    }
    if (isImageField(name, field)) {
      const text = String(value ?? '').trim();
      if (looksLikeImage(text)) add(text);
    }
  }
  return out.slice(0, MAX_PREVIEWS);
}
