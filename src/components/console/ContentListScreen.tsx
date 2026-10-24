'use client';

/**
 * A content list, and only a list: full width, the scope tabs, the rows, and one
 * title field that creates a row.
 *
 * Opening a row is a navigation, not a selection — the row has its own address
 * (`/console/<kind>/<id>`), so the browser's Back button, a reload and a pasted link
 * all behave the way they do everywhere else on the web. The editor therefore owns no
 * list and the list owns no editor; they meet only at the URL.
 *
 * Creating asks for a title and nothing else. The identity (slug, route, uid) is
 * derived from that title on the server, where it can be checked against every row,
 * trashed ones included.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConsoleList } from './ConsoleList';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert, type Tone } from '@/components/ui/Status';
import { Tabs } from '@/components/ui/Tabs';
import { consoleCall } from './client-api';
import type { ContentScreenData } from '@/lib/console/content-screen';
import type { ContentLocale } from '@/lib/content/kinds';
import { writeScopeQuery, type ListScope } from '@/lib/content/list-view';
import { contentDetailPath } from '@/lib/console/paths';
import type { ContentRow } from '@/lib/content/store';
import type { MessageKey } from '@/lib/console/messages';

export function ContentListScreen({ data }: Readonly<{ data: ContentScreenData }>) {
  const { labels, kind, scopeKind } = data;
  const api = `/api/console/content/${kind}`;
  const named = scopeKind === 'lists';
  const router = useRouter();

  const [scope, setScope] = useState<ListScope>({
    listKey: data.listKey,
    locale: data.activeLocale,
    trash: data.trash,
    focusKey: null,
  });
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; key: MessageKey } | null>(null);

  const locale: ContentLocale = scope.locale === 'en' ? 'en' : 'ar';
  const scopeValue = named ? String(scope.listKey ?? '') : locale;
  const scopeQuery = writeScopeQuery({ listKey: named ? scopeValue : null, locale });

  function tell(result: { status: number; error: string | null }, ok: MessageKey): void {
    if (result.error) {
      const mapped = `content.error.${result.error}` as MessageKey;
      setNotice({ tone: 'danger', key: labels[mapped] ? mapped : 'content.error.save' });
      return;
    }
    setNotice({ tone: 'ok', key: ok });
  }

  async function create(): Promise<void> {
    const name = title.trim();
    if (!name || !data.abilities.create.includes(scopeValue)) return;
    setBusy(true);
    const result = await consoleCall<{ row?: ContentRow }>(`${api}${scopeQuery}`, 'POST', { title: name, locale });
    setBusy(false);
    const created = result.data?.row;
    if (!created) {
      tell(result, 'content.saved');
      return;
    }
    setTitle('');
    setCreating(false);
    // A new row is empty, and its own screen is where the two language tabs live.
    router.push(`${contentDetailPath(kind, created.id)}${scopeQuery}`);
  }

  function switchScope(patch: Partial<ListScope>): void {
    setScope((current) => ({ ...current, ...patch }));
    setNotice(null);
  }

  const tabs = data.scopes.map((candidate) => ({
    id: String(candidate),
    label: named
      ? (data.lists.find((list) => list.key === candidate)?.label ?? String(candidate))
      : labels[`content.locale.${candidate}` as MessageKey],
  }));

  return (
    <div className="console-work" data-kind={kind}>
      <section className="console-work-list" aria-label={labels['content.rows']}>
        <div className="console-work-bar">
          <div className="console-controls">
            <Button active={scope.trash} aria-pressed={scope.trash} onClick={() => switchScope({ trash: !scope.trash })}>
              {scope.trash ? labels['content.live'] : labels['content.trash']}
            </Button>
            {data.abilities.create.includes(scopeValue) && !scope.trash && (
              <Button variant="primary" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
                {labels['content.new']}
              </Button>
            )}
          </div>
        </div>

        {/* The two language tabs (or the lists) sit above the rows, where the scope
            they change is visible at a glance. The editor has the same two tabs, so
            switching language never means hunting for a dropdown. */}
        {tabs.length > 0 && (
          <Tabs
            items={tabs}
            value={String(scopeValue)}
            onChange={(id) => switchScope(named ? { listKey: id } : { locale: id as ContentLocale })}
            label={labels[named ? 'content.list.pick' : 'content.language']}
            idBase={`scope-${kind}`}
            className="console-tabs"
          />
        )}

        {creating && (
          <form
            className="ui-card console-panel console-create"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Field label={labels['content.title']} htmlFor="new-title" note={<span className="ui-label-note">{labels[`content.locale.${locale}` as MessageKey]}</span>}>
              <Input
                id="new-title"
                value={title}
                autoFocus
                maxLength={500}
                placeholder={labels['content.title_hint']}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <div className="console-controls">
              <Button type="submit" variant="primary" loading={busy} disabled={title.trim() === ''}>
                {labels['content.create']}
              </Button>
              <Button onClick={() => setCreating(false)}>{labels['content.cancel']}</Button>
            </div>
            <p className="ui-lede">{labels['content.slug_auto']}</p>
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
          onScopeChange={switchScope}
        />
        {notice && <Alert tone={notice.tone}>{labels[notice.key]}</Alert>}
      </section>
    </div>
  );
}
