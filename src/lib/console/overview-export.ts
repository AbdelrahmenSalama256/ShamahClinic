/**
 * `overview-<from>-<to>.csv` — the screen's numbers as one long table.
 *
 * The shape is deliberately flat: five columns, every row self-describing, so a
 * pivot table or a formula can read the file without knowing which section it came
 * from. The alternative — a block per panel with its own header row — reads better
 * in a browser preview and worse in a spreadsheet, and the Reports Center (stage 4)
 * is where a formatted workbook belongs.
 *
 * Column names and section names are stable English identifiers rather than the
 * console's translated titles, for the same reason the lead CSV does it: a formula
 * must keep working when the interface is switched to Arabic. Values are data —
 * Arabic page titles and city names appear as themselves.
 *
 * The recent-leads list is not here. Names and phone numbers leave through
 * `lead.export`, which is a different grant and writes its own audit row; a
 * statistics download must not become a second, quieter way to export contacts.
 */
import { csvCell } from '../leads/export';
import type { OverviewData } from './overview';

const COLUMNS = ['section', 'label', 'metric', 'value', 'detail'] as const;

/** Weekday names in the order the heatmap draws them: Sunday is 0, the clinic's week. */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** The three attention keys, said in words a reader who is not the console can follow. */
const ATTENTION: Record<string, string> = {
  'overview.attention.unanswered': 'New leads older than 24 hours',
  'overview.attention.unattributed': 'Leads with no source in the range',
  'overview.attention.booked': 'Booked longer than 7 days',
};

type Row = readonly [string, string | number, string | number, string | number, string | number];

function line(row: Row): string {
  return row.map(csvCell).join(',') + '\r\n';
}

/** A blank source is Direct, never a missing row. */
function sourceName(label: string): string {
  return label === '' ? 'Direct' : label;
}

export interface OverviewCsv {
  csv: string;
  /** Data rows, not counting the header — what the audit row records. */
  rows: number;
}

export function overviewCsv(data: OverviewData): OverviewCsv {
  const rows: Row[] = [];
  const add = (
    section: string,
    label: string | number,
    metric: string | number,
    value: string | number,
    detail: string | number = '',
  ): void => {
    rows.push([section, label, metric, value, detail]);
  };

  add('meta', 'generated_at', '', data.generatedAt);
  add('meta', 'range', data.range.key, `${data.range.days} days`);
  add('meta', 'from', '', data.range.from);
  add('meta', 'to', '', data.range.to);
  add('meta', 'compare', '', data.compare ? 'yes' : 'no');
  if (data.previous) {
    add('meta', 'previous_from', '', data.previous.from);
    add('meta', 'previous_to', '', data.previous.to);
  }
  add('meta', 'sources_basis', '', data.sourcesBasis);

  for (const kpi of data.kpis) {
    add('kpi', kpi.key, 'value', kpi.value, kpi.unit);
    if (kpi.previous !== null) add('kpi', kpi.key, 'previous', kpi.previous, kpi.unit);
    if (kpi.delta !== null) add('kpi', kpi.key, kpi.unit === 'percent' ? 'delta_points' : 'delta_percent', kpi.delta);
  }

  for (const point of data.daily) {
    add('daily', point.day, 'views', point.views);
    add('daily', point.day, 'visitors', point.visitors);
    add('daily', point.day, 'leads', point.leads);
  }
  for (const point of data.previousDaily ?? []) {
    add('previous_daily', point.day, 'views', point.views);
    add('previous_daily', point.day, 'visitors', point.visitors);
    add('previous_daily', point.day, 'leads', point.leads);
  }
  for (const point of data.engagement) {
    add('engagement', point.day, 'cta', point.cta);
    add('engagement', point.day, 'submit', point.submit);
  }

  for (const slice of data.sources) {
    add('sources', sourceName(slice.label), data.sourcesBasis, slice.value);
  }
  for (const slice of data.leads?.campaigns ?? []) {
    add('campaigns', sourceName(slice.label), 'leads', slice.value);
  }
  for (const slice of data.leads?.services ?? []) {
    add('services', sourceName(slice.label), 'leads', slice.value);
  }
  for (const slice of data.leads?.branches ?? []) {
    add('branches', sourceName(slice.label), 'leads', slice.value);
  }
  for (const status of data.leads?.statuses ?? []) {
    add('funnel', status.status, 'leads', status.count);
  }

  for (const cell of data.heatmap.cells) {
    add('heatmap', WEEKDAYS[cell.weekday] ?? cell.weekday, String(cell.hour).padStart(2, '0'), cell.views);
  }
  // The two numbers that say whether the heatmap can be trusted at all.
  add('heatmap', 'coverage', 'placed', data.heatmap.placed);
  add('heatmap', 'coverage', 'missing', data.heatmap.missing);

  for (const page of data.topPages) {
    add('top_pages', page.path, 'views', page.views);
    add('top_pages', page.path, 'visitors', page.visitors);
  }
  for (const article of data.topArticles) {
    add('top_articles', article.path, 'views', article.views, article.titleAr || article.titleEn);
    add('top_articles', article.path, 'visitors', article.visitors);
  }
  for (const device of data.devices) {
    add('devices', device.device, 'views', device.views);
    add('devices', device.device, 'leads', device.leads);
  }
  for (const city of data.cities) {
    add('cities', city.city === '' ? 'Unknown' : city.city, 'views', city.views);
    add('cities', city.city === '' ? 'Unknown' : city.city, 'visitors', city.visitors);
  }
  for (const item of data.attention) {
    add('attention', ATTENTION[item.key] ?? item.key, 'count', item.count, item.href);
  }
  for (const entry of data.library) {
    add('library', entry.resource, 'rows', entry.count);
  }

  const header = COLUMNS.join(',') + '\r\n';
  return { csv: `\uFEFF${header}${rows.map(line).join('')}`, rows: rows.length };
}
