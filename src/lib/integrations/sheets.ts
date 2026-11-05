/**
 * The Google Sheets connector, as data: the URL rule, the row the sheet receives, and
 * the Apps Script the owner pastes into their own spreadsheet.
 *
 * The console prints the script from this one constant, so the code the owner copies,
 * the headers the sheet grows, and the keys the delivery sends cannot drift apart. The
 * script is read-only in the console — there is no box that edits it — and it accepts
 * nothing but the fixed columns below, which keeps a compromised form from writing
 * formulas into arbitrary cells.
 */
import type { LeadRecord } from '../leads/store';

export const SHEETS_KIND = 'google_sheets';

export const SHEETS_HEADERS = [
  'Received',
  'Name',
  'Phone',
  'Email',
  'Service',
  'Offer',
  'Branch',
  'Preferred date',
  'Message',
  'Source',
  'Page',
  'Language',
  'Campaign',
  'Lead ID',
] as const;

export type SheetsHeader = (typeof SHEETS_HEADERS)[number];
export type SheetsRow = Record<SheetsHeader, string>;

export interface SheetsConfig {
  /** The deployed Apps Script `/exec` URL. */
  url: string;
  /** Sent in the body; the script compares it with its own TOKEN constant. Never printed. */
  token: string;
  enabled: boolean;
}

/** A real deployment lives here; a loopback URL exists so the tests can run one. */
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{25,}\/exec$/;
const LOOPBACK_URL = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/[A-Za-z0-9_./-]*$/;
const TOKEN = /^[A-Za-z0-9_-]{0,80}$/;

export type UrlVerdict =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'scheme' | 'host' | 'path' };

export function validateSheetsUrl(raw: unknown): UrlVerdict {
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (url === '') return { ok: false, reason: 'empty' };
  if (/^http:\/\//.test(url) && !LOOPBACK_URL.test(url)) return { ok: false, reason: 'scheme' };
  if (APPS_SCRIPT_URL.test(url) || LOOPBACK_URL.test(url)) return { ok: true, value: url };
  if (!/^https:\/\//.test(url)) return { ok: false, reason: 'scheme' };
  if (!/^https:\/\/script\.google\.com\//.test(url)) return { ok: false, reason: 'host' };
  return { ok: false, reason: 'path' };
}

export function validateToken(raw: unknown): boolean {
  return typeof raw === 'string' && TOKEN.test(raw);
}

/** Enough to recognise which deployment is saved, not enough to use or leak it. */
export function maskUrl(url: string): string {
  const tail = url.slice(-4);
  if (/^https:\/\/script\.google\.com\//.test(url)) return `https://script.google.com/macros/s/••••${tail}`;
  return url.replace(/^(https?:\/\/[^/]+).*$/, `$1/…${tail}`);
}

export function normalizeSheetsConfig(raw: unknown): SheetsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { url: '', token: '', enabled: false };
  const value = raw as Record<string, unknown>;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  const token = typeof value.token === 'string' && TOKEN.test(value.token) ? value.token : '';
  return { url, token, enabled: value.enabled === true };
}

/** Attempts already made → how long to wait before the next one. */
export function backoffSeconds(attempts: number): number {
  const steps = [60, 300, 900, 3600, 21600];
  const index = Math.min(Math.max(1, Math.trunc(attempts)), steps.length) - 1;
  return steps[index];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function fieldOf(lead: LeadRecord, key: string): string {
  const fields = lead.fields ?? {};
  return text(fields[key]);
}

/** One lead as the sheet's columns, in the header order the script writes. */
export function rowFromLead(lead: LeadRecord): SheetsRow {
  const utm = lead.utm ?? {};
  const campaign = [utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).join(' / ');
  return {
    Received: lead.createdAt ? lead.createdAt.slice(0, 19).replace('T', ' ') : '',
    Name: lead.name,
    Phone: lead.phone,
    Email: lead.email,
    Service: fieldOf(lead, 'service'),
    Offer: fieldOf(lead, 'offer'),
    Branch: fieldOf(lead, 'branch'),
    'Preferred date': fieldOf(lead, 'date'),
    Message: lead.message ?? '',
    Source: lead.source,
    Page: lead.pagePath,
    Language: lead.locale,
    Campaign: campaign,
    'Lead ID': lead.id,
  };
}

/**
 * The script the owner deploys. Generated rather than typed into a text box, so the
 * headers here and in the spreadsheet are the same list by construction.
 */
export function sheetsScript(headers: readonly string[] = SHEETS_HEADERS): string {
  return `/**
 * Shamah Clinics — booking form to Google Sheets.
 * Paste this entire file into Extensions → Apps Script, then Deploy → New deployment
 * → Web app (Execute as: Me, Who has access: Anyone). Copy the /exec URL into the console.
 */
var HEADERS = ${JSON.stringify(headers)};
var TOKEN = ''; // optional: the same token typed in the console's "Extra security" tab

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (TOKEN && body.token !== TOKEN) return reply({ ok: false, error: 'unauthorized' });
    var row = body.row || {};
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    var leadIdCol = HEADERS.indexOf('Lead ID');
    var phoneCol = HEADERS.indexOf('Phone');

    // Find the first empty row so we never leave gaps behind.
    // If a previous row was written but its Lead ID was empty (failed send), skip it
    // so the next append does not land on a missing row number.
    var rowNum = 2;
    while (rowNum <= sheet.getLastRow()) {
      var existingLeadId = sheet.getRange(rowNum, leadIdCol + 1).getValue();
      if (existingLeadId === '') {
        // This row is incomplete; skip it and keep searching.
        rowNum++;
        continue;
      }
      // No double row: the sheet already carries this lead.
      if (existingLeadId === row['Lead ID']) {
        return reply({ ok: true });
      }
      // Found a partial row; write our row after it.
      rowNum++;
      break;
    }

    var values = HEADERS.map(function (key) { return row[key] === undefined ? '' : row[key]; });
    sheet.getRange(rowNum, 1, 1, values.length).setValues([values]);

    // Phone as text: keep leading zeros, stop +/@ being parsed as a formula.
    if (phoneCol >= 0) {
      sheet.getRange(rowNum, phoneCol + 1).setNumberFormat('@');
    }

    return reply({ ok: true });
  } catch (error) {
    return reply({ ok: false, error: String(error) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, service: 'shamah-sheets' });
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}

/** A test submission nobody can mistake for a real enquiry. */
export function testRow(now = new Date()): SheetsRow {
  return {
    Received: now.toISOString().slice(0, 19).replace('T', ' '),
    Name: 'TEST — Shamah console',
    Phone: '+20 100 000 0000',
    Email: '',
    Service: 'Connection test',
    Offer: '',
    Branch: '',
    'Preferred date': '',
    Message: 'This row proves the console can reach this sheet. Safe to delete.',
    Source: 'console-test',
    Page: '/console/tracking',
    Language: 'en',
    Campaign: '',
    'Lead ID': 'test',
  };
}
