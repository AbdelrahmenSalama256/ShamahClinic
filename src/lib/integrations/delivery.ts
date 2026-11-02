/**
 * Delivering a lead to the owner's spreadsheet, and never losing one trying.
 *
 * The lead row is written first, in its own statement, before anything is queued; the
 * outbox row that follows is a promise to deliver, not the record of the enquiry. A
 * delivery that fails is retried with a growing pause, and the console can see every
 * attempt and ask for the failed ones again. Nothing here deletes an outbox row: the
 * log is how the owner knows what happened.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db';
import { json } from '../db/json';
import { getLead, skipSheetsLead } from '../leads/store';
import {
  SHEETS_KIND,
  backoffSeconds,
  normalizeSheetsConfig,
  rowFromLead,
  testRow,
  validateSheetsUrl,
  type SheetsConfig,
  type SheetsRow,
} from './sheets';

export interface SheetsIntegration {
  id: string;
  config: SheetsConfig;
  enabled: boolean;
  lastError: string | null;
  updatedAt: string;
}

export interface PostResult {
  ok: boolean;
  status: number;
  error: string;
}

export interface DeliveryRow {
  id: string;
  leadId: string;
  attempts: number;
  status: 'sent' | 'retrying' | 'pending';
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function readSheetsIntegration(): Promise<SheetsIntegration | null> {
  const row = await db
    .selectFrom('integrations')
    .selectAll()
    .where('kind', '=', SHEETS_KIND)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    config: normalizeSheetsConfig(row.config),
    enabled: Number(row.enabled) === 1,
    lastError: row.last_error,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function saveSheetsIntegration(input: {
  config: SheetsConfig;
  enabled: boolean;
  actorId: string;
}): Promise<SheetsIntegration> {
  const existing = await db
    .selectFrom('integrations')
    .select(['id', 'version'])
    .where('kind', '=', SHEETS_KIND)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const value = json({ ...input.config, enabled: input.enabled });
  if (existing) {
    await db
      .updateTable('integrations')
      .set({ config: value, enabled: input.enabled ? 1 : 0, updated_by: input.actorId, version: Number(existing.version) + 1 })
      .where('id', '=', existing.id)
      .execute();
  } else {
    await db
      .insertInto('integrations')
      .values({
        id: randomUUID(),
        kind: SHEETS_KIND,
        name: 'Google Sheets',
        config: value,
        enabled: input.enabled ? 1 : 0,
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .execute();
  }
  const saved = await readSheetsIntegration();
  if (!saved) throw new Error('sheets integration was not saved');
  return saved;
}

/** Queue one lead for the sheet. Already queued, still unsent → no second row.
 * Demo/test leads (source 'console-test', or a marked demo row) are never queued. */
export async function enqueueSheetsLead(leadId: string): Promise<boolean> {
  const integration = await readSheetsIntegration();
  if (!integration?.enabled) return false;
  if (!validateSheetsUrl(integration.config.url).ok) return false;

  // A demo/test lead never reaches the sheet, so check before we index it.
  const lead = await getLead(leadId);
  if (!lead || skipSheetsLead(lead)) return false;

  const pending = await db
    .selectFrom('outbox')
    .select('id')
    .where('kind', '=', SHEETS_KIND)
    .where('sent_at', 'is', null)
    .where(sql<boolean>`JSON_UNQUOTE(JSON_EXTRACT(payload, '$.leadId')) = ${leadId}`)
    .executeTakeFirst();
  if (pending) return false;

  await db
    .insertInto('outbox')
    .values({ id: randomUUID(), kind: SHEETS_KIND, payload: json({ leadId }) })
    .execute();
  return true;
}

/**
 * Apps Script answers a POST with a 302 to googleusercontent.com. Following it with
 * `fetch` turns the request into a GET and drops the body, so the redirect is followed
 * by hand, repeating the POST at the new address.
 */
export async function postSheets(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
  };
  try {
    let response = await fetchImpl(url, init);
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { ok: false, status: response.status, error: 'redirect without a location' };
      response = await fetchImpl(location, init);
    }
    const text = await response.text().catch(() => '');
    let parsed: { ok?: unknown; error?: unknown } | null = null;
    try {
      parsed = JSON.parse(text) as { ok?: unknown; error?: unknown };
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const detail = parsed?.error ?? text;
      return { ok: false, status: response.status, error: String(detail || `HTTP ${response.status}`).slice(0, 300) };
    }
    if (parsed && parsed.ok === false) {
      return { ok: false, status: response.status, error: String(parsed.error ?? 'rejected').slice(0, 300) };
    }
    return { ok: true, status: response.status, error: '' };
  } catch (error) {
    return { ok: false, status: 0, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}

function payloadLeadId(payload: unknown): string {
  const value = typeof payload === 'string' ? safeJson(payload) : payload;
  if (!value || typeof value !== 'object') return '';
  const id = (value as { leadId?: unknown }).leadId;
  return typeof id === 'string' ? id : '';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Send what is due. A disabled or unconfigured connector pauses the queue, not loses it. */
export async function drainOutbox(limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const integration = await readSheetsIntegration();
  if (!integration?.enabled) return { sent: 0, failed: 0, skipped: 0 };
  const verdict = validateSheetsUrl(integration.config.url);
  if (!verdict.ok) return { sent: 0, failed: 0, skipped: 0 };

  const due = await db
    .selectFrom('outbox')
    .selectAll()
    .where('kind', '=', SHEETS_KIND)
    .where('sent_at', 'is', null)
    .where('next_attempt_at', '<=', new Date())
    .orderBy('next_attempt_at', 'asc')
    .limit(Math.max(1, Math.min(50, limit)))
    .execute();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    const leadId = payloadLeadId(row.payload);
    const lead = leadId ? await getLead(leadId) : null;
    if (!lead) {
      await db
        .updateTable('outbox')
        .set({ sent_at: new Date(), last_error: 'lead is gone' })
        .where('id', '=', row.id)
        .execute();
      skipped += 1;
      continue;
    }
    // Demo/test leads never reach the sheet, even on a retry.
    if (skipSheetsLead(lead)) {
      skipped += 1;
      continue;
    }

    const result = await postSheets(verdict.value, { token: integration.config.token, row: rowFromLead(lead) });
    if (result.ok) {
      await db.updateTable('outbox').set({ sent_at: new Date(), last_error: null }).where('id', '=', row.id).execute();
      await db.updateTable('leads').set({ sheets_sent_at: new Date() }).where('id', '=', lead.id).execute();
      sent += 1;
    } else {
      const attempts = Number(row.attempts) + 1;
      await db
        .updateTable('outbox')
        .set({
          attempts,
          next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000),
          last_error: result.error,
        })
        .where('id', '=', row.id)
        .execute();
      await db
        .updateTable('integrations')
        .set({ last_error: result.error.slice(0, 1000) })
        .where('id', '=', integration.id)
        .execute();
      failed += 1;
    }
  }

  return { sent, failed, skipped };
}

/** The console's delivery log: newest first, with the lead id the row carries. */
export async function deliveryLog(limit = 50): Promise<DeliveryRow[]> {
  const rows = await db
    .selectFrom('outbox')
    .selectAll()
    .where('kind', '=', SHEETS_KIND)
    .orderBy('created_at', 'desc')
    .limit(Math.max(1, Math.min(200, limit)))
    .execute();
  return rows.map((row) => ({
    id: row.id,
    leadId: payloadLeadId(row.payload),
    attempts: Number(row.attempts),
    status: row.sent_at ? 'sent' : Number(row.attempts) > 0 ? 'retrying' : 'pending',
    lastError: row.last_error,
    createdAt: toIso(row.created_at) ?? '',
    sentAt: toIso(row.sent_at),
    nextAttemptAt: toIso(row.next_attempt_at) ?? '',
  }));
}

/** Put every failed delivery back at the front of the queue. */
export async function resendFailed(): Promise<number> {
  const result = await db
    .updateTable('outbox')
    .set({ next_attempt_at: new Date() })
    .where('kind', '=', SHEETS_KIND)
    .where('sent_at', 'is', null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0);
}

/** One clearly-labelled row straight to the sheet, without touching the queue. */
export async function sendTestRow(
  row: SheetsRow = testRow(),
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  const integration = await readSheetsIntegration();
  if (!integration) return { ok: false, status: 0, error: 'not configured' };
  const verdict = validateSheetsUrl(integration.config.url);
  if (!verdict.ok) return { ok: false, status: 0, error: `url ${verdict.reason}` };
  return postSheets(verdict.value, { token: integration.config.token, row }, fetchImpl);
}
