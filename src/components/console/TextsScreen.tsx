'use client';

/**
 * The texts screen: every sentence the site renders, in one table per part of the site.
 *
 * The rows are the components' own wording, not a list somebody typed. A person who has
 * never opened the code can still find a sentence here by searching for the words on the
 * page, because the words on the page are the row. The empty field is the rule that makes
 * this safe: leaving a box empty means the site keeps its own sentence, so nothing here
 * can delete copy by accident — writing into the box and clearing it again is the whole
 * edit cycle, and it is reversible at every step.
 *
 * The screen does not page. 220 rows is the point: a person correcting the wording of the
 * booking form wants the booking rows in front of them, not one page of a table whose order
 * they cannot see. Search and the changed/unchanged filter are client-side because every
 * row is already here, and asking the database for a substring of a sentence it just sent
 * would be a second source of truth for the same list.
 *
 * Changing the language is not a filter either — it re-reads the screen. Arabic and English
 * are separate records, and a row that is rewritten in one can still be the site's own
 * wording in the other.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { consoleCall } from './client-api';
import { Badge, Button, Empty, Input, Note, Select, Textarea } from './kit';
import { Tabs } from './kit-tabs';
import { Card } from './kit';
import { slotsOf } from '@/lib/copy/shared';
import type { MessageKey } from '@/lib/console/messages';
import type { OrphanTextRow, TextRow, TextsData } from '@/lib/console/texts-center';
import type { ContentLocale } from '@/lib/content/kinds';

const LANGUAGE_TABS: ContentLocale[] = ['ar', 'en'];

/** What one address holds in each language, after the server wrote it. */
interface Stored {
  ar: string | null;
  en: string | null;
}

type Filter = 'all' | 'changed' | 'same';

/**
 * A `{1}` the sentence never had would reach the site as the characters `{1}`: the page
 * fills only the slots its own wording carries. Warned, never blocked — dropping a slot is
 * a legitimate edit ("3 نتائج" becoming "النتائج"), inventing one is not.
 */
function hasUnknownSlot(value: string, authored: string): boolean {
  const count = slotsOf(authored).length;
  return [...slotsOf(value)].some((slot) => Number(slot.slice(1, -1)) >= count);
}

function errorKey(code: string): MessageKey {
  if (code === 'forbidden') return 'texts.error.forbidden';
  if (code === 'invalid_input') return 'texts.error.invalid_input';
  return 'texts.failed';
}

function matches(row: TextRow, needle: string): boolean {
  if (needle === '') return true;
  // Both languages are in the haystack: an Arabic speaker who knows the English sentence
  // finds it from the Arabic tab, and a file path is as searchable as the words.
  const haystack = [row.ar, row.en, row.file, row.override.ar ?? '', row.override.en ?? ''].join('\n').toLowerCase();
  return haystack.includes(needle);
}

/**
 * One sentence's own field.
 *
 * Saving happens on blur, not per keystroke: a sentence is written once, and a request per
 * character would turn a slow edit into a queue of writes whose last one may not be the
 * one on screen. The value the server returns is what the badge and the reset button then
 * work from, so a rejected save cannot leave the screen looking changed.
 */
function TextField({
  row,
  locale,
  authored,
  initial,
  writable,
  labels,
  onStored,
}: Readonly<{
  row: TextRow | OrphanTextRow;
  locale: ContentLocale;
  authored: string;
  initial: Stored;
  writable: boolean;
  labels: Record<MessageKey, string>;
  onStored: (key: string, stored: Stored) => void;
}>) {
  const [value, setValue] = useState(initial[locale] ?? '');
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const stored = initial[locale] ?? '';
  const isLong = authored.length > 70 || value.length > 70;
  const slotWarning = hasUnknownSlot(value, authored);
  const changed = stored !== '';

  async function persist(next: string): Promise<void> {
    if (!writable || saving) return;
    const trimmed = next.trim();
    if ((baseline[locale] ?? '') === trimmed) return;

    setSaving(true);
    setNotice(null);
    const result = await consoleCall<{ stored: Stored }>(`/api/console/copy?locale=${locale}`, 'POST', {
      key: row.key,
      value: trimmed,
    });
    setSaving(false);
    if (result.error) {
      setNotice({ tone: 'danger', text: labels[errorKey(result.error)] });
      return;
    }
    const saved = result.data?.stored ?? { ar: null, en: null };
    setBaseline(saved);
    setValue(saved[locale] ?? '');
    onStored(row.key, saved);
    setNotice({ tone: 'ok', text: labels['texts.saved'] });
  }

  const field = isLong ? (
    <Textarea
      className="console-screen-input console-screen-textarea"
      rows={3}
      value={writable ? value : stored || authored}
      placeholder={authored}
      aria-label={`${labels['texts.column.edit']}: ${authored.slice(0, 60)}`}
      readOnly={!writable}
      disabled={saving}
      maxLength={4000}
      onChange={(event) => {
        setValue(event.target.value);
        setNotice(null);
      }}
      onBlur={() => void persist(value)}
    />
  ) : (
    <Input
      className="console-screen-input"
      type="text"
      value={writable ? value : stored || authored}
      placeholder={authored}
      aria-label={`${labels['texts.column.edit']}: ${authored.slice(0, 60)}`}
      readOnly={!writable}
      disabled={saving}
      maxLength={4000}
      onChange={(event) => {
        setValue(event.target.value);
        setNotice(null);
      }}
      onBlur={() => void persist(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && writable) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );

  return (
    <>
      <td>
        {field}
        {slotWarning && (
          <Note tone="warn" className="console-screen-notice">
            {labels['texts.slot_warning']}
          </Note>
        )}
        {notice && (
          <Note tone={notice.tone} className="console-screen-notice">
            {notice.text}
          </Note>
        )}
      </td>
      <td className="console-screen-cell-status">
        <Badge tone={changed ? 'ok' : 'neutral'}>{labels[changed ? 'texts.status.changed' : 'texts.status.same']}</Badge>
        {changed && (
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              void persist('');
            }}
          >
            {labels['texts.reset']}
          </Button>
        )}
      </td>
    </>
  );
}

export function TextsScreen({ data, labels }: Readonly<{ data: TextsData; labels: Record<MessageKey, string> }>) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  /** What each address holds, after a save, until the server renders again. */
  const [stored, setStored] = useState<ReadonlyMap<string, Stored>>(
    () => new Map(data.rows.map((row) => [row.key, row.override])),
  );

  const onStored = useCallback((key: string, next: Stored) => {
    setStored((current) => {
      const before = current.get(key);
      if (before?.ar === next.ar && before?.en === next.en) return current;
      const map = new Map(current);
      map.set(key, next);
      return map;
    });
  }, []);

  const locale = data.locale;
  const needle = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = data.rows.filter((row) => {
      const current = stored.get(row.key) ?? row.override;
      const changed = current.ar !== null || current.en !== null;
      if (filter === 'changed' && !changed) return false;
      if (filter === 'same' && changed) return false;
      return matches(row, needle);
    });
    const ordered: { area: string; rows: TextRow[] }[] = [];
    for (const row of visible) {
      const last = ordered.at(-1);
      if (last?.area === row.area) last.rows.push(row);
      else ordered.push({ area: row.area, rows: [row] });
    }
    return ordered;
  }, [data.rows, filter, needle, stored]);

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: labels['texts.filter.all'] },
    { value: 'changed', label: labels['texts.filter.changed'] },
    { value: 'same', label: labels['texts.filter.same'] },
  ];

  return (
    <div className="console-texts">
      <p className="console-lede">{labels['texts.intro']}</p>

      <Tabs
        items={LANGUAGE_TABS.map((candidate) => ({
          id: candidate,
          label: labels[`content.locale.${candidate}` as MessageKey],
        }))}
        value={locale}
        onChange={(next) => router.push(`/console/texts?locale=${next}`)}
        label={labels['texts.language']}
        idBase="texts-center"
        className="console-tabs"
      />

      <div className="console-screen-tools">
        <Input
          bar
          type="search"
          className="console-screen-search"
          value={search}
          placeholder={labels['texts.search']}
          aria-label={labels['texts.search']}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          bar
          className="console-screen-filter"
          value={filter}
          aria-label={labels['texts.column.status']}
          onChange={(event) => setFilter(event.target.value as Filter)}
        >
          {filters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <Note className="console-screen-readonly">
        {labels['texts.count'].replace('{changed}', String(data.changed)).replace('{total}', String(data.total))}
      </Note>

      {!data.writable && <Note tone="warn" className="console-screen-readonly">{labels['texts.readonly']}</Note>}

      {groups.length === 0 ? (
        <Empty>{labels['texts.empty']}</Empty>
      ) : (
        groups.map((group) => (
          <section key={group.area} className="console-screen-section">
            <h2 className="console-subheading">
              {labels[`texts.area.${group.area}` as MessageKey]}
            </h2>
            <Card flat flush className="console-table-wrap">
              <table className="console-table console-texts-table">
                <thead>
                  <tr>
                    <th scope="col">{labels['texts.column.sentence']}</th>
                    <th scope="col">{labels['texts.column.edit']}</th>
                    <th scope="col">{labels['texts.column.status']}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="console-screen-cell-name">
                        <span className="console-texts-word">{locale === 'ar' ? row.ar : row.en}</span>
                        <code className="console-texts-source">
                          {row.file}:{row.line}
                        </code>
                        {row.uses > 1 && <Note>{labels['texts.used'].replace('{n}', String(row.uses))}</Note>}
                        {(row.override.ar !== null || row.override.en !== null) &&
                          (locale === 'ar' ? row.override.en : row.override.ar) !== null && (
                            <Note tone="ok">{labels['texts.other_locale']}</Note>
                          )}
                      </th>
                      <TextField
                        row={row}
                        locale={locale}
                        authored={locale === 'ar' ? row.ar : row.en}
                        initial={stored.get(row.key) ?? row.override}
                        writable={data.writable}
                        labels={labels}
                        onStored={onStored}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))
      )}

      {data.orphaned.length > 0 && (
        <section className="console-screen-section">
          <h2 className="console-subheading">{labels['texts.orphaned']}</h2>
          <p className="console-lede">{labels['texts.orphaned_note']}</p>
          <Card flat flush className="console-table-wrap">
            <table className="console-table console-texts-table">
              <tbody>
                {data.orphaned.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="console-screen-cell-name">
                      <span className="console-texts-word">
                        {(locale === 'ar' ? row.ar : row.en) || (locale === 'ar' ? row.defaultAr : row.defaultEn) || ''}
                      </span>
                      {row.file && <code className="console-texts-source">{row.file}</code>}
                    </th>
                    <TextField
                      row={row}
                      locale={locale}
                      authored={(locale === 'ar' ? row.defaultAr : row.defaultEn) ?? ''}
                      initial={{ ar: row.ar, en: row.en }}
                      writable={data.writable}
                      labels={labels}
                      onStored={onStored}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}
