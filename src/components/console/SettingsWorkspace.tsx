'use client';

/**
 * The site's settings as one editable JSON value per `(group, key)`.
 *
 * A row flagged `is_secret` has no value in the payload at all — `readSettings`
 * withholds it — so this component can only say the value exists and where it
 * lives. That is the point of rendering it rather than hiding it: an operator
 * looking for a token needs to learn it is configured in the environment, not that
 * the console is broken.
 */
import { useState } from 'react';
import { consoleCall } from './client-api';
import { Button } from '@/components/ui/Button';
import type { MessageKey } from '@/lib/console/messages';
import type { SettingView } from '@/lib/content/settings';

function encoded(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? null, null, 2);
}

export function SettingsWorkspace({
  rows,
  labels,
  canWrite,
}: Readonly<{ rows: SettingView[]; labels: Record<MessageKey, string>; canWrite: boolean }>) {
  const [edited, setEdited] = useState<Record<string, string>>({});
  // Which row is in flight, not merely whether one is: the spinner has to sit on the
  // control that asked, and every other row stays put while it waits.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const busy = busyId !== null;

  async function save(row: SettingView): Promise<void> {
    const id = `${row.group}.${row.key}`;
    const text = edited[id] ?? encoded(row.value);
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      setNotice({ tone: 'error', text: labels['content.error.json'] });
      return;
    }
    setBusyId(id);
    const result = await consoleCall('/api/console/settings', 'PATCH', { group: row.group, key: row.key, value });
    setBusyId(null);
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'error', text: labels[mapped] ?? labels['content.error.save'] });
      return;
    }
    setNotice({ tone: 'ok', text: labels['content.saved'] });
  }

  if (rows.length === 0) return <p className="console-lede">{labels['content.empty']}</p>;

  return (
    <>
      {rows.map((row) => {
        const id = `${row.group}.${row.key}`;
        const current = edited[id] ?? encoded(row.value);
        return (
          <section className="console-panel" key={id}>
            <h2 className="console-subheading">
              {row.key} <span className="console-chip">{row.group}</span>
            </h2>
            {row.secret ? (
              <p className="console-alert">{labels['content.secret']}</p>
            ) : (
              <div className="console-field">
                <label htmlFor={`setting-${id}`}>{id}</label>
                <textarea
                  id={`setting-${id}`}
                  rows={6}
                  value={current}
                  readOnly={!canWrite}
                  onChange={(event) => setEdited((state) => ({ ...state, [id]: event.target.value }))}
                />
                {canWrite && (
                  <Button variant="primary" loading={busyId === id} disabled={busy} onClick={() => void save(row)}>
                    {labels['content.save']}
                  </Button>
                )}
              </div>
            )}
            <p className="console-note">
              {labels['content.updated_at']}: {row.updatedAt.slice(0, 10)} · {labels['content.version']} {row.version}
            </p>
          </section>
        );
      })}
      {notice && (
        <p className="console-alert" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
    </>
  );
}
