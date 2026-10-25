'use client';

/**
 * The SEO center: one row per address the site serves, in the order a person looks for
 * them, with the two fields a search result is made of.
 *
 * The screen does not page. The whole point is comparing every title at once — a list
 * that shows twenty rows would hide the four that are missing a description. The row set
 * is built on the server from the same reads the public pages use, so what the input's
 * placeholder shows is exactly the copy a crawler gets today.
 *
 * Search and the status filter are client-side on purpose: every row is already here, and
 * asking the database for a substring of a title it just sent would be a second source of
 * truth for the same list. Changing the language is not a filter — it re-reads the screen,
 * because the inherited copy and the overrides are both per language.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Empty, Input, Note, Select } from './kit';
import { Tabs } from './kit-tabs';
import { SeoFields } from './SeoFields';
import { Card } from './kit';
import type { SeoCenterData, SeoRow, SeoSection } from '@/lib/console/seo-center';
import type { MessageKey } from '@/lib/console/messages';
import type { ContentLocale } from '@/lib/content/kinds';
import type { SeoStatus } from '@/lib/content/seo-limits';

/** The server's `SEO_SECTIONS`, restated because importing that module would pull its
 *  database reads into this bundle. The order is the order the tables are drawn in. */
const SECTION_ORDER: readonly SeoSection[] = ['pages', 'articles', 'offers', 'services', 'branches'];

const LANGUAGE_TABS: ContentLocale[] = ['ar', 'en'];

function matches(row: SeoRow, status: SeoStatus, needle: string): boolean {
  if (needle === '') return true;
  const haystack = [row.label, row.path, row.override?.title ?? row.inherited.title, row.override?.description ?? row.inherited.description]
    .join('\n')
    .toLowerCase();
  return haystack.includes(needle);
}

export function SeoCenter({ data, labels }: Readonly<{ data: SeoCenterData; labels: Record<MessageKey, string> }>) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SeoStatus | 'all'>('all');
  /** The status each row shows after an edit, before the server renders again. */
  const [statuses, setStatuses] = useState<ReadonlyMap<string, SeoStatus>>(
    () => new Map(data.rows.map((row) => [row.key, row.status])),
  );

  const onStatusChange = useCallback((key: string) => (status: SeoStatus) => {
    setStatuses((current) => {
      if (current.get(key) === status) return current;
      const next = new Map(current);
      next.set(key, status);
      return next;
    });
  }, []);

  const needle = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = data.rows.filter((row) => {
      const status = statuses.get(row.key) ?? row.status;
      return (filter === 'all' || status === filter) && matches(row, status, needle);
    });
    return SECTION_ORDER.map((section) => ({
      section,
      rows: visible.filter((row) => row.section === section),
    })).filter((group) => group.rows.length > 0);
  }, [data.rows, filter, needle, statuses]);

  const filters: { value: SeoStatus | 'all'; label: string }[] = [
    { value: 'all', label: labels['seo.filter.all'] },
    { value: 'ok', label: labels['seo.status.ok'] },
    { value: 'long', label: labels['seo.status.long'] },
    { value: 'missing', label: labels['seo.status.missing'] },
  ];

  return (
    <div className="console-seo-center">
      <p className="console-lede">{labels['seo.intro']}</p>

      <Tabs
        items={LANGUAGE_TABS.map((candidate) => ({
          id: candidate,
          label: labels[`content.locale.${candidate}` as MessageKey],
        }))}
        value={data.locale}
        onChange={(next) => router.push(`/console/seo?locale=${next}`)}
        label={labels['seo.language']}
        idBase="seo-center"
        className="console-tabs"
      />

      <div className="console-seo-tools">
        <Input
          bar
          type="search"
          className="console-seo-search"
          value={search}
          placeholder={labels['seo.search']}
          aria-label={labels['seo.search']}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          bar
          className="console-seo-filter"
          value={filter}
          aria-label={labels['seo.column.status']}
          onChange={(event) => setFilter(event.target.value as SeoStatus | 'all')}
        >
          {filters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {!data.writable && <Note className="console-seo-readonly">{labels['seo.readonly']}</Note>}

      {groups.length === 0 ? (
        <Empty>{labels['seo.empty']}</Empty>
      ) : (
        groups.map((group) => (
          <section key={group.section} className="console-seo-section">
            <h2 className="console-subheading">{labels[`seo.section.${group.section}` as MessageKey]}</h2>
            <Card flat flush className="console-table-wrap">
              <table className="console-table console-seo-table">
                <thead>
                  <tr>
                    <th scope="col">{labels['seo.column.page']}</th>
                    <th scope="col">{labels['seo.column.title']}</th>
                    <th scope="col">{labels['seo.column.description']}</th>
                    <th scope="col">{labels['seo.column.status']}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="console-seo-cell-page">
                        <a className="console-seo-link" href={row.href} target="_blank" rel="noreferrer">
                          <span className="console-row-title">{row.label}</span>
                          <code className="console-row-key">{row.path === '' ? '/' : row.path}</code>
                        </a>
                        <Note>{row.override ? labels['seo.custom'] : labels['seo.inherited']}</Note>
                      </th>
                      <SeoFields
                        path={row.path}
                        locale={data.locale}
                        inherited={row.inherited}
                        initial={row.override}
                        writable={data.writable}
                        labels={labels}
                        rowLabel={row.label}
                        variant="row"
                        onStatusChange={onStatusChange(row.key)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
