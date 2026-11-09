'use client';

/**
 * Redirects and the 404 monitor, on one screen because one feeds the other: a broken
 * address in the 404 tab becomes a rule in the Redirects tab with one click, its source
 * already filled in.
 *
 * Every write goes to `/api/console/redirects` and then re-reads the screen from the
 * server, so the hit counts and the list never drift from what the proxy is serving.
 */
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { consoleCall } from './client-api';
import { Badge, Button, Card, Checkbox, Empty, Field, Input, Note, Select, type Tone } from './kit';
import { Tabs } from './kit-tabs';
import type { MessageKey } from '@/lib/console/messages';
import type { NotFoundView } from '@/lib/content/not-found-log';
import type { RedirectView } from '@/lib/content/redirects';

export interface RedirectsScreenProps {
  redirects: RedirectView[];
  notFound: NotFoundView[];
  can: { create: boolean; update: boolean; delete: boolean };
  labels: Record<MessageKey, string>;
}

interface Draft {
  id: string | null;
  source: string;
  target: string;
  status: 301 | 302;
  match: 'exact' | 'prefix';
  note: string;
  enabled: boolean;
}

const BLANK: Draft = { id: null, source: '', target: '', status: 301, match: 'exact', note: '', enabled: true };

function errorKey(code: string | undefined, labels: Record<MessageKey, string>): MessageKey {
  const key = `redirects.error.${code}` as MessageKey;
  return code && labels[key] ? key : 'redirects.error.save';
}

const day = (iso: string) => iso.slice(0, 10);

export function RedirectsScreen({ redirects, notFound, can, labels }: Readonly<RedirectsScreenProps>) {
  const router = useRouter();
  const id = useId();
  const [tab, setTab] = useState<'rules' | 'missing'>('rules');
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);
  const [search, setSearch] = useState('');

  const writable = draft.id ? can.update : can.create;
  const redirected = new Set(redirects.map((rule) => rule.source));

  async function submit(): Promise<void> {
    setBusy(true);
    setNotice(null);
    const body = { source: draft.source, target: draft.target, status: draft.status, match: draft.match, note: draft.note, enabled: draft.enabled };
    const result = draft.id
      ? await consoleCall(`/api/console/redirects/${draft.id}`, 'PATCH', body)
      : await consoleCall('/api/console/redirects', 'POST', body);
    setBusy(false);
    if (result.error) {
      const issue = result.issues?.[0]?.message;
      setNotice({ tone: 'danger', key: errorKey(issue ?? result.error, labels) });
      return;
    }
    setDraft(BLANK);
    setNotice({ tone: 'ok', key: 'redirects.saved' });
    router.refresh();
  }

  async function remove(path: string, confirmKey: MessageKey): Promise<void> {
    if (!window.confirm(labels[confirmKey])) return;
    setBusy(true);
    const result = await consoleCall(path, 'DELETE');
    setBusy(false);
    setNotice(result.error ? { tone: 'danger', key: 'redirects.error.save' } : { tone: 'ok', key: 'redirects.removed' });
    router.refresh();
  }

  async function toggle(rule: RedirectView, enabled: boolean): Promise<void> {
    setBusy(true);
    await consoleCall(`/api/console/redirects/${rule.id}`, 'PATCH', { ...rule, enabled });
    setBusy(false);
    router.refresh();
  }

  const needle = search.trim().toLowerCase();
  const rules = redirects.filter((rule) => !needle || `${rule.source} ${rule.target} ${rule.note}`.toLowerCase().includes(needle));
  const misses = notFound.filter((row) => !needle || row.path.toLowerCase().includes(needle));

  return (
    <div className="console-redirects">
      <p className="console-lede">{labels['redirects.intro']}</p>
      <Tabs
        items={[
          { id: 'rules', label: `${labels['redirects.tab.rules']} (${redirects.length})` },
          { id: 'missing', label: `${labels['redirects.tab.missing']} (${notFound.length})` },
        ]}
        value={tab}
        onChange={(next) => setTab(next as 'rules' | 'missing')}
        label={labels['nav.redirects']}
        idBase="redirects"
        className="console-tabs"
      />

      {notice && (
        <Note tone={notice.tone} className="console-screen-notice">
          {labels[notice.key]}
        </Note>
      )}

      {tab === 'rules' && (
        <>
          {(can.create || draft.id) && (
            <Card as="section" className="console-panel console-redirect-form">
              <h2 className="console-subheading">{draft.id ? labels['redirects.edit'] : labels['redirects.add']}</h2>
              <div className="console-redirect-grid">
                <Field label={labels['redirects.source']} htmlFor={`${id}-source`} note={<Note>{labels['redirects.source.hint']}</Note>}>
                  <Input id={`${id}-source`} dir="ltr" value={draft.source} placeholder="/old-page" disabled={!writable || busy} onChange={(event) => setDraft({ ...draft, source: event.target.value })} />
                </Field>
                <Field label={labels['redirects.target']} htmlFor={`${id}-target`} note={<Note>{labels['redirects.target.hint']}</Note>}>
                  <Input id={`${id}-target`} dir="ltr" value={draft.target} placeholder="/services" disabled={!writable || busy} onChange={(event) => setDraft({ ...draft, target: event.target.value })} />
                </Field>
                <Field label={labels['redirects.type']} htmlFor={`${id}-status`}>
                  <Select id={`${id}-status`} value={draft.status} disabled={!writable || busy} onChange={(event) => setDraft({ ...draft, status: Number(event.target.value) === 302 ? 302 : 301 })}>
                    <option value={301}>{labels['redirects.type.301']}</option>
                    <option value={302}>{labels['redirects.type.302']}</option>
                  </Select>
                </Field>
                <Field label={labels['redirects.match']} htmlFor={`${id}-match`}>
                  <Select id={`${id}-match`} value={draft.match} disabled={!writable || busy} onChange={(event) => setDraft({ ...draft, match: event.target.value === 'prefix' ? 'prefix' : 'exact' })}>
                    <option value="exact">{labels['redirects.match.exact']}</option>
                    <option value="prefix">{labels['redirects.match.prefix']}</option>
                  </Select>
                </Field>
                <Field label={labels['redirects.note']} htmlFor={`${id}-note`}>
                  <Input id={`${id}-note`} value={draft.note} disabled={!writable || busy} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
                </Field>
              </div>
              <div className="console-redirect-actions">
                <Button variant="primary" disabled={!writable || busy || !draft.source.trim() || !draft.target.trim()} loading={busy} onClick={() => void submit()}>
                  {draft.id ? labels['redirects.save'] : labels['redirects.create']}
                </Button>
                {(draft.id || draft.source || draft.target) && (
                  <Button variant="ghost" disabled={busy} onClick={() => setDraft(BLANK)}>
                    {labels['redirects.cancel']}
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="console-screen-tools">
            <Input bar type="search" className="console-screen-search" value={search} placeholder={labels['redirects.search']} aria-label={labels['redirects.search']} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {rules.length === 0 ? (
            <Empty>{labels['redirects.empty']}</Empty>
          ) : (
            <Card flat flush className="console-table-wrap">
              <table className="console-table console-redirect-table">
                <thead>
                  <tr>
                    <th scope="col">{labels['redirects.source']}</th>
                    <th scope="col">{labels['redirects.target']}</th>
                    <th scope="col">{labels['redirects.type']}</th>
                    <th scope="col">{labels['redirects.hits']}</th>
                    <th scope="col">{labels['redirects.enabled']}</th>
                    <th scope="col">
                      <span className="console-sr-only">{labels['redirects.actions']}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <code dir="ltr">{rule.source}{rule.match === 'prefix' ? '/*' : ''}</code>
                        {rule.note && <Note>{rule.note}</Note>}
                      </td>
                      <td>
                        <code dir="ltr">{rule.target}</code>
                      </td>
                      <td>
                        <Badge tone={rule.status === 301 ? 'ok' : 'warn'}>{rule.status}</Badge>
                      </td>
                      <td>{rule.hits}</td>
                      <td>
                        <Checkbox
                          checked={rule.enabled}
                          disabled={!can.update || busy}
                          aria-label={`${labels['redirects.enabled']}: ${rule.source}`}
                          onChange={(event) => void toggle(rule, event.target.checked)}
                        />
                      </td>
                      <td className="console-redirect-row-actions">
                        {can.update && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft({ id: rule.id, source: rule.source, target: rule.target, status: rule.status, match: rule.match, note: rule.note, enabled: rule.enabled })}>
                            {labels['redirects.edit_short']}
                          </Button>
                        )}
                        {can.delete && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(`/api/console/redirects/${rule.id}`, 'redirects.confirm_delete')}>
                            {labels['redirects.delete']}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {tab === 'missing' && (
        <>
          <Note>{labels['redirects.missing.intro']}</Note>
          <div className="console-screen-tools">
            <Input bar type="search" className="console-screen-search" value={search} placeholder={labels['redirects.search']} aria-label={labels['redirects.search']} onChange={(event) => setSearch(event.target.value)} />
            {can.delete && notFound.length > 0 && (
              <Button variant="ghost" disabled={busy} onClick={() => void remove('/api/console/redirects/404/all', 'redirects.confirm_clear')}>
                {labels['redirects.missing.clear']}
              </Button>
            )}
          </div>
          {misses.length === 0 ? (
            <Empty>{labels['redirects.missing.empty']}</Empty>
          ) : (
            <Card flat flush className="console-table-wrap">
              <table className="console-table console-redirect-table">
                <thead>
                  <tr>
                    <th scope="col">{labels['redirects.missing.path']}</th>
                    <th scope="col">{labels['redirects.hits']}</th>
                    <th scope="col">{labels['redirects.missing.last']}</th>
                    <th scope="col">{labels['redirects.missing.referrer']}</th>
                    <th scope="col">
                      <span className="console-sr-only">{labels['redirects.actions']}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {misses.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <code dir="ltr">{row.path}</code>
                        {redirected.has(row.path) && <Badge tone="ok">{labels['redirects.missing.fixed']}</Badge>}
                      </td>
                      <td>{row.hits}</td>
                      <td>
                        <bdi>{day(row.lastSeen)}</bdi>
                      </td>
                      <td className="console-redirect-referrer">
                        <span dir="ltr">{row.referrer || '—'}</span>
                      </td>
                      <td className="console-redirect-row-actions">
                        {can.create && !redirected.has(row.path) && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setDraft({ ...BLANK, source: row.path });
                              setNotice(null);
                              setTab('rules');
                            }}
                          >
                            {labels['redirects.missing.make']}
                          </Button>
                        )}
                        {can.delete && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(`/api/console/redirects/404/${row.id}`, 'redirects.confirm_forget')}>
                            {labels['redirects.delete']}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
