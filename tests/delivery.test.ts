/**
 * S3c — the Google Sheets outbox, against a real loopback Apps Script stand-in.
 *
 * The promise the console makes is one sentence: "a failed delivery never loses a
 * lead." These tests hold it to that by taking the endpoint down *after* the lead has
 * been accepted, then checking the row is still there, still queued, and still sends
 * once the endpoint returns. The stand-in also repeats Apps Script's real behaviour:
 * a POST answered by a 302, where following the redirect with `fetch` would silently
 * turn the retry into a body-less GET.
 *
 * Most tests drive the delivery layer directly with rows from `recordLead`, so the
 * outbox assertions are not racing the public route's own fire-and-forget drain. The
 * last test goes through the real public route, which is the layer that could lose a
 * lead in the first place.
 *
 * Every row is named `s3c-<run>` and removed afterwards; the connector is restored to
 * "no integration" because no other suite uses it.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { syncRoles } from '../src/lib/auth/roles';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import { POST as submitLeadRoute } from '../src/app/api/v1/lead/route';
import { getLead, recordLead } from '../src/lib/leads/store';
import {
  deliveryLog,
  drainOutbox,
  enqueueSheetsLead,
  readSheetsIntegration,
  resendFailed,
  saveSheetsIntegration,
  sendTestRow,
  type DeliveryRow,
} from '../src/lib/integrations/delivery';
import { SHEETS_HEADERS, SHEETS_KIND, type SheetsConfig } from '../src/lib/integrations/sheets';

const run = randomUUID().slice(0, 8);
const MARK = `s3c-${run}`;
const PASSWORD = 'Shamah-sheets-2026';

interface Received {
  path: string;
  method: string;
  body: unknown;
}

let mode: 'ok' | 'fail' | 'reject' = 'ok';
const received: Received[] = [];
let server: Server;
let base = '';

function bodyOf(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = (req.url ?? '/').split('?')[0];
  const text = await bodyOf(req);
  if (mode === 'fail') {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('upstream is down');
    return;
  }
  if (mode === 'reject') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return;
  }
  if (req.method === 'POST' && path === '/exec') {
    // What a real deployment does: a 302, not a 200, on the address the owner pasted.
    res.writeHead(302, { location: `${base}/macros/s/${MARK}/exec` });
    res.end();
    return;
  }
  received.push({ path, method: req.method ?? '', body: readJson(text) });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

let actorId = '';
const userIds: string[] = [];
const leadIds: string[] = [];

async function makeLead(name: string): Promise<string> {
  const saved = await recordLead({
    source: 'booking',
    formId: 'site',
    name,
    phone: '0100 000 0000',
    message: `${MARK} message`,
    locale: 'en',
    pagePath: `/${MARK}/contact`,
    idempotencyKey: `${MARK}-${randomUUID()}`,
  });
  leadIds.push(saved.id);
  return saved.id;
}

async function configure(config: Partial<SheetsConfig> = {}): Promise<void> {
  await saveSheetsIntegration({
    config: { url: `${base}/exec`, token: '', enabled: true, ...config },
    enabled: config.enabled ?? true,
    actorId,
  });
}

async function outboxRowsFor(leadId: string) {
  const rows = await db.selectFrom('outbox').selectAll().where('kind', '=', SHEETS_KIND).execute();
  return rows.filter((row) => {
    const payload =
      typeof row.payload === 'string'
        ? (readJson(row.payload) as { leadId?: string } | null)
        : (row.payload as { leadId?: string } | null);
    return payload?.leadId === leadId;
  });
}

async function waitFor(check: () => Promise<boolean>, ms = 5000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the scheduled drain did not finish in time');
}

async function purge(): Promise<void> {
  await db.deleteFrom('outbox').where('kind', '=', SHEETS_KIND).execute();
  if (leadIds.length > 0) {
    await db.deleteFrom('lead_notes').where('lead_id', 'in', leadIds).execute();
    await db.deleteFrom('audit_log').where('entity_id', 'in', leadIds).execute();
    await db.deleteFrom('leads').where('id', 'in', leadIds).execute();
  }
}

beforeAll(async () => {
  assertTestDb();
  await db.deleteFrom('integrations').where('kind', '=', SHEETS_KIND).execute();
  await db.deleteFrom('outbox').where('kind', '=', SHEETS_KIND).execute();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  server = createServer((req, res) => {
    handler(req, res).catch((error) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the fake endpoint did not bind');
  base = `http://127.0.0.1:${address.port}`;

  // The shared system role: created by `syncRoles` above and left in place, because
  // other suites use the same row.
  const ownerRole = await getOrCreateRole('Owner', { is_system: true, is_owner: true });
  actorId = await createUser({ email: `${MARK}-owner@example.invalid`, password: PASSWORD, name: `S3C ${run}` });
  userIds.push(actorId);
  await assignRole(actorId, ownerRole);
}, 60_000);

afterAll(async () => {
  await purge();
  await db.deleteFrom('integrations').where('kind', '=', SHEETS_KIND).execute();
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', [`${MARK}-owner@example.invalid`]).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await destroyDb();
});

describe('the Apps Script handshake', () => {
  it('follows the 302 by repeating the POST, so the row is not dropped at the redirect', async () => {
    received.length = 0;
    mode = 'ok';
    await configure();
    const result = await sendTestRow();
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].path).toBe(`/macros/s/${MARK}/exec`);
    expect(received[0].method).toBe('POST');
    const body = received[0].body as { row?: Record<string, string> };
    expect(Object.keys(body.row ?? {}).sort()).toEqual([...SHEETS_HEADERS].sort());
    expect(body.row?.Name).toBe('TEST — Shamah console');
    expect(body.row?.Source).toBe('console-test');
  });

  it('treats a 200 that says ok:false as a failure, not a delivery', async () => {
    mode = 'reject';
    const result = await sendTestRow();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unauthorized');
  });
});

describe('a failed delivery never loses a lead', () => {
  it('keeps the lead and queues it with a growing pause when the endpoint is down', async () => {
    mode = 'ok';
    await configure();
    const leadId = await makeLead('S3C Down Endpoint');
    expect(await enqueueSheetsLead(leadId)).toBe(true);

    mode = 'fail';
    const before = Date.now();
    const result = await drainOutbox();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);

    expect(await getLead(leadId)).not.toBeNull();
    const [row] = await outboxRowsFor(leadId);
    expect(row?.sent_at).toBeNull();
    expect(Number(row?.attempts)).toBe(1);
    expect(String(row?.last_error)).toContain('upstream is down');
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(before);
    expect((await readSheetsIntegration())?.lastError).toContain('upstream is down');

    const lead = await db.selectFrom('leads').select('sheets_sent_at').where('id', '=', leadId).executeTakeFirstOrThrow();
    expect(lead.sheets_sent_at).toBeNull();

    const log = await deliveryLog(50);
    const entry: DeliveryRow | undefined = log.find((item) => item.leadId === leadId);
    expect(entry?.status).toBe('retrying');
    expect(entry?.lastError).toContain('upstream is down');
  });

  it('does not retry before the pause has passed', async () => {
    mode = 'fail';
    const result = await drainOutbox();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it('sends on "resend failed" once the endpoint is back', async () => {
    const leadId = leadIds[0];
    mode = 'ok';
    received.length = 0;
    expect(await resendFailed()).toBeGreaterThan(0);
    const result = await drainOutbox();
    expect(result.sent).toBe(1);
    expect(received).toHaveLength(1);
    const body = received[0].body as { row?: Record<string, string> };
    expect(body.row?.['Lead ID']).toBe(leadId);

    const [row] = await outboxRowsFor(leadId);
    expect(row?.sent_at).not.toBeNull();
    expect(row?.last_error).toBeNull();
    const lead = await db.selectFrom('leads').select('sheets_sent_at').where('id', '=', leadId).executeTakeFirstOrThrow();
    expect(lead.sheets_sent_at).not.toBeNull();

    const log = await deliveryLog(50);
    expect(log.find((item) => item.leadId === leadId)?.status).toBe('sent');
  });

  it('queues a lead once, not twice', async () => {
    const leadId = await makeLead('S3C Once');
    expect(await enqueueSheetsLead(leadId)).toBe(true);
    expect(await enqueueSheetsLead(leadId)).toBe(false);
    expect(await outboxRowsFor(leadId)).toHaveLength(1);
  });

  it('holds the queue, and still keeps the lead, when the connector is switched off', async () => {
    const leadId = await makeLead('S3C Off');
    await configure({ enabled: false });
    expect(await enqueueSheetsLead(leadId)).toBe(false);
    expect(await drainOutbox()).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(await getLead(leadId)).not.toBeNull();
    expect(await outboxRowsFor(leadId)).toEqual([]);
    await configure();
  });

  it('keeps a lead submitted through the public route while the sheet is down, then delivers it', async () => {
    mode = 'fail';
    await configure();
    const name = 'S3C Route Submit';

    const res = await submitLeadRoute(
      new Request('http://localhost/api/v1/lead', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${(run.charCodeAt(0) + 7) % 250}`,
          referer: `https://site.test/${MARK}/contact`,
        },
        body: JSON.stringify({ name, phone: '0100 000 0000', message: `${MARK} route`, lang: 'en' }),
      }),
    );
    expect(res.status).toBe(200);

    const saved = await db
      .selectFrom('leads')
      .select('id')
      .where('page_path', 'like', `/${MARK}%`)
      .where('name', '=', name)
      .executeTakeFirstOrThrow();
    leadIds.push(saved.id);

    // The route queues in the same request and drains after answering; the row is
    // only proof of the queue once the drain has recorded its first attempt.
    await waitFor(async () => (await outboxRowsFor(saved.id))[0]?.attempts === 1);
    const [failed] = await outboxRowsFor(saved.id);
    expect(failed.sent_at).toBeNull();
    expect(String(failed.last_error)).toContain('upstream is down');

    const mid = await db.selectFrom('leads').select('sheets_sent_at').where('id', '=', saved.id).executeTakeFirstOrThrow();
    expect(mid.sheets_sent_at).toBeNull();

    mode = 'ok';
    received.length = 0;
    await resendFailed();
    const result = await drainOutbox();
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect((received[0].body as { row?: Record<string, string> }).row?.['Lead ID']).toBeDefined();

    const [delivered] = await outboxRowsFor(saved.id);
    expect(delivered.sent_at).not.toBeNull();
    const lead = await db
      .selectFrom('leads')
      .select('sheets_sent_at')
      .where('id', '=', saved.id)
      .executeTakeFirstOrThrow();
    expect(lead.sheets_sent_at).not.toBeNull();
  });
});
