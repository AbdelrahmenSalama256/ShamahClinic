/**
 * The two files a lead list leaves the console as.
 *
 *   - `leads.csv` — every column the console knows, including the attribution the
 *     tracking layer wrote (landing page, first referrer, five utm fields, both click
 *     ids, device, city). This is the file a clinic hands to an agency or loads into a
 *     spreadsheet, so the headers are stable English identifiers rather than the console's
 *     translated column titles: a formula written against `utm_source` must not break
 *     when the interface is switched to Arabic.
 *
 *   - `google-ads.csv` — the offline-conversion upload Google Ads expects. Only leads
 *     with a gclid whose status reached `booked` or `done` are included, the time is the
 *     lead's own timestamp in Cairo time (the ad account's timezone), and the value and
 *     currency are left blank because the clinic has not told us what an appointment is
 *     worth — a filled-in zero would be a number nobody chose.
 *
 * Both are streamed in batches of `EXPORT_BATCH`, newest first, and both pass every row
 * through `redactLead()` even though the route already required `lead.export` (which
 * implies contact visibility): the rule lives in one place, and a future grant that can
 * export without seeing contact details must not leak through this file.
 */
import type { Grant } from '../auth/permissions';
import { redactLead } from '../auth/redaction';
import {
  countLeadExport,
  countLeadOffline,
  EXPORT_BATCH,
  leadExportBatch,
  leadOfflineBatch,
  type LeadExportCursor,
  type LeadExportFilters,
  type LeadExportRow,
  type LeadRecord,
} from './store';

/** The conversion action name the clinic creates in Google Ads. Must match exactly. */
export const GOOGLE_ADS_CONVERSION_NAME = 'Appointment booked';

const LEAD_COLUMNS = [
  'id',
  'created_at',
  'name',
  'phone',
  'email',
  'source',
  'status',
  'locale',
  'page_path',
  'landing_page',
  'referrer',
  'first_referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'device',
  'city',
  'message',
  'fields',
] as const;

type LeadColumn = (typeof LEAD_COLUMNS)[number];

const GOOGLE_ADS_COLUMNS = ['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency'] as const;

/** RFC 4180: quote anything that could otherwise break a row, and double the quotes. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // A leading =, +, - or @ is how a spreadsheet is told to evaluate a cell. Lead text is
  // visitor-written, so it is prefixed with an apostrophe rather than trusted.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function valueOf(lead: LeadRecord & { contact_hidden?: boolean }, column: LeadColumn): unknown {
  switch (column) {
    case 'created_at':
      return lead.createdAt;
    case 'page_path':
      return lead.pagePath;
    case 'landing_page':
      return lead.landingPage;
    case 'first_referrer':
      return lead.firstReferrer;
    case 'utm_source':
      return lead.campaign.source;
    case 'utm_medium':
      return lead.campaign.medium;
    case 'utm_campaign':
      return lead.campaign.campaign;
    case 'utm_term':
      return lead.campaign.term;
    case 'utm_content':
      return lead.campaign.content;
    case 'fields':
      return lead.fields ? JSON.stringify(lead.fields) : '';
    default:
      return lead[column];
  }
}

/**
 * The lead's timestamp in the ad account's timezone, `yyyy-MM-dd HH:mm:ss+HH:mm` —
 * the one format Google Ads accepts for an offline conversion upload. `longOffset`
 * carries the DST shift, so summer conversions are not silently an hour early.
 */
const CAIRO = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

export function cairoTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = CAIRO.formatToParts(date);
  const at = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  const offset = at('timeZoneName').replace('GMT', '') || '+00:00';
  return `${at('year')}-${at('month')}-${at('day')} ${at('hour')}:${at('minute')}:${at('second')}${offset}`;
}

function toStream(chunks: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function* batches(
  load: (cursor: LeadExportCursor | null) => Promise<LeadExportRow[]>,
): AsyncGenerator<LeadExportRow[]> {
  let cursor: LeadExportCursor | null = null;
  for (;;) {
    const rows = await load(cursor);
    if (rows.length === 0) return;
    yield rows;
    cursor = rows[rows.length - 1].cursor;
    if (rows.length < EXPORT_BATCH) return;
  }
}

/** UTF-8 BOM first, so Excel opens the Arabic names and messages as Arabic. */
export function leadCsvStream(filters: LeadExportFilters, grants: readonly Grant[]): ReadableStream<Uint8Array> {
  async function* chunks(): AsyncGenerator<string> {
    yield `\uFEFF${LEAD_COLUMNS.join(',')}\r\n`;
    for await (const rows of batches((cursor) => leadExportBatch(filters, cursor))) {
      let chunk = '';
      for (const { lead } of rows) {
        const safe = redactLead(grants, lead);
        chunk += `${LEAD_COLUMNS.map((column) => cell(valueOf(safe, column))).join(',')}\r\n`;
      }
      yield chunk;
    }
  }
  return toStream(chunks());
}

export function googleAdsCsvStream(filters: LeadExportFilters): ReadableStream<Uint8Array> {
  async function* chunks(): AsyncGenerator<string> {
    yield `\uFEFF${GOOGLE_ADS_COLUMNS.join(',')}\r\n`;
    for await (const rows of batches((cursor) => leadOfflineBatch(filters, cursor))) {
      let chunk = '';
      for (const { lead } of rows) {
        chunk +=
          [cell(lead.gclid), cell(GOOGLE_ADS_CONVERSION_NAME), cell(cairoTime(lead.createdAt)), cell(''), cell('')].join(',') + '\r\n';
      }
      yield chunk;
    }
  }
  return toStream(chunks());
}

export async function countLeadRows(filters: LeadExportFilters): Promise<number> {
  return countLeadExport(filters);
}

export async function countGoogleAdsRows(filters: LeadExportFilters): Promise<number> {
  return countLeadOffline(filters);
}
