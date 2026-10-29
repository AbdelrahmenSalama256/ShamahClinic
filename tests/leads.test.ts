/**
 * BK-17a: the two public forms write a lead, and the console works it.
 *
 * What a reviewer cannot see by reading one file:
 *   - a double-tapped booking is one row (the idempotency key), while two different
 *     visitors are two;
 *   - the redaction rule is decided on the server: a Viewer's row is the same lead with
 *     name, phone, email, message and extra fields blanked, and notes withheld with them;
 *   - a scoped `leadSources` grant can move its own source and cannot borrow another's
 *     by pasting an id or by naming the wrong `?source=` in the URL;
 *   - the status change that succeeded wrote an audit row.
 *
 * Every fixture is named `bk17-<run>` and every row it creates is removed in `afterAll`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { CSRF_HEADER } from '../src/lib/auth/env';
import type { Grant } from '../src/lib/auth/permissions';
import { ROLE_SEEDS, syncRoles } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import { leadsHandler } from '../src/lib/leads/api';
import { getLead, type LeadNote } from '../src/lib/leads/store';
import { leadRow, leadsScreenData, parseLeadsView, type LeadRow } from '../src/lib/leads/view';
import { POST as submitLead } from '../src/app/api/v1/lead/route';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-leads-2026';
const MARK = `bk17-${run}`;

interface Session {
  email: string;
  id: string;
  token: string;
  csrf: string;
  grants: Grant[];
}

const emails = {
  Owner: `${MARK}-owner@example.invalid`,
  Editor: `${MARK}-editor@example.invalid`,
  Marketer: `${MARK}-marketer@example.invalid`,
  Viewer: `${MARK}-viewer@example.invalid`,
  Scoped: `${MARK}-scoped@example.invalid`,
} as const;

const actors = {} as Record<keyof typeof emails, Session>;
const userIds: string[] = [];
const scopedRole = { id: '' };

let ipSeq = 0;
const ip = (): string => `198.51.100.${++ipSeq % 250}`;

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

function consoleRequest(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip());
  return new Request(`http://localhost/api/console/leads${path}`, { ...init, headers });
}

function read(actor: Session): RequestInit & { cookie: string } {
  return { cookie: `shamah_session=${actor.token}` };
}

function write(actor: Session, method: 'POST' | 'PATCH', body: unknown): RequestInit & { cookie: string } {
  return {
    method,
    cookie: `shamah_session=${actor.token}`,
    headers: { [CSRF_HEADER]: actor.csrf, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function login(email: string): Promise<Session> {
  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip() },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const body = (await res.json()) as { csrfToken: string };
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return {
    email,
    id: row.id,
    token: cookieValue(setCookies(res), 'shamah_session'),
    csrf: body.csrfToken,
    grants: (await loadGrants(row.id)).grants,
  };
}

async function purge(): Promise<void> {
  const ids = (await db.selectFrom('leads').select('id').where('page_path', 'like', `/${MARK}%`).execute()).map((row) => row.id);
  if (ids.length > 0) await db.deleteFrom('lead_notes').where('lead_id', 'in', ids).execute();
  if (ids.length > 0) await db.deleteFrom('audit_log').where('entity_id', 'in', ids).execute();
  await db.deleteFrom('leads').where('page_path', 'like', `/${MARK}%`).execute();
}

/** A booking and a contact-form submission, both through the public route. */
async function submit(body: Record<string, unknown>, referer: string, from = ip()): Promise<Response> {
  return submitLead(
    new Request('http://localhost/api/v1/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from, referer },
      body: JSON.stringify(body),
    }),
  );
}

/** MariaDB keeps JSON as text; mysql2 sometimes hands it back parsed. */
function jsonOf(value: unknown): Record<string, unknown> {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Record<string, unknown>;
}

let bookingId = '';
let contactId = '';

beforeAll(async () => {
  assertTestDb();
  await purge();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  // A role that works one source only: the scope dimension the API reads from `?source=`.
  scopedRole.id = await getOrCreateRole(`${MARK}-booking-only`, { is_system: false });
  await db
    .insertInto('role_permissions')
    .values([
      { id: randomUUID(), role_id: scopedRole.id, resource: 'lead', action: 'read', scope: json(null) },
      { id: randomUUID(), role_id: scopedRole.id, resource: 'lead', action: 'update', scope: json({ leadSources: ['booking'] }) },
    ])
    .execute();

  const roleIds = new Map<string, string>();
  for (const role of await db.selectFrom('roles').select(['id', 'name']).execute()) roleIds.set(role.name, role.id);

  for (const [key, email] of Object.entries(emails)) {
    const name = key as keyof typeof emails;
    const roleName = name === 'Scoped' ? `${MARK}-booking-only` : name;
    const id = await createUser({ email, password: PASSWORD, name: `BK17 ${name}` });
    await assignRole(id, roleIds.get(roleName) ?? '');
    userIds.push(id);
    actors[name] = await login(email);
  }
});

afterAll(async () => {
  await purge();
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('login_attempts').where('email_lc', 'in', Object.values(emails).map((email) => email.toLowerCase())).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await db.deleteFrom('role_permissions').where('role_id', '=', scopedRole.id).execute();
  await db.deleteFrom('roles').where('id', '=', scopedRole.id).execute();
  const catalog = await db.selectFrom('roles').select('id').where('name', 'in', ROLE_SEEDS.map((role) => role.name)).execute();
  if (catalog.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', catalog.map((role) => role.id)).execute();
    await db.deleteFrom('roles').where('id', 'in', catalog.map((role) => role.id)).execute();
  }
  await destroyDb();
});

describe('the public form lands in the leads table (BK-17a)', () => {
  it('records a booking with the page context the visitor came from', async () => {
    const res = await submit(
      { name: 'BK17 Booking', phone: '0100 111 2222', date: '2026-11-02', branch: 'zamalek', service: 'filler', message: 'morning please', lang: 'en' },
      `https://site.test/${MARK}/booking?utm_source=instagram&utm_campaign=autumn`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; mode: string; whatsappUrl?: string };
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('whatsapp');
    expect(body.whatsappUrl).toContain('wa.me');

    const row = await db
      .selectFrom('leads')
      .selectAll()
      .where('page_path', '=', `/${MARK}/booking`)
      .executeTakeFirstOrThrow();
    bookingId = row.id;
    expect(row.source).toBe('booking');
    expect(row.form_id).toBe('site');
    expect(row.locale).toBe('en');
    expect(row.status).toBe('new');
    expect(jsonOf(row.utm)).toMatchObject({ utm_source: 'instagram', utm_campaign: 'autumn' });
    expect(jsonOf(row.fields)).toMatchObject({ date: '2026-11-02', branch: 'zamalek', service: 'filler' });
  });

  it('collapses a double tap into one lead', async () => {
    const path = `/${MARK}/double-tap`;
    const form = { name: 'BK17 Twice', phone: '0100 333 4444', date: '2026-11-03' };
    // One visitor, one browser: the same address for both taps.
    const from = ip();
    const first = await submit(form, `https://site.test${path}`, from);
    const second = await submit(form, `https://site.test${path}`, from);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await db.selectFrom('leads').selectAll().where('page_path', '=', path).execute();
    expect(rows).toHaveLength(1);
  });

  it('records the contact form as its own source', async () => {
    const res = await submit(
      { name: 'BK17 Contact', phone: '0100 555 6666', service: 'consultation', message: 'I have a question' },
      `https://site.test/${MARK}/contact`,
    );
    expect(res.status).toBe(200);
    const row = await db
      .selectFrom('leads')
      .selectAll()
      .where('page_path', '=', `/${MARK}/contact`)
      .executeTakeFirstOrThrow();
    contactId = row.id;
    expect(row.source).toBe('contact-form');
    expect(jsonOf(row.fields)).toMatchObject({ service: 'consultation' });
  });
});

describe('what a grant may see (BK-17a)', () => {
  it('gives the Owner the contact fields and a Viewer only the record', async () => {
    const owner = await leadsHandler(consoleRequest(`?q=${encodeURIComponent('BK17 Booking')}`, read(actors.Owner)));
    expect(owner.status).toBe(200);
    const ownerRow = ((await owner.json()) as { leads: LeadRow[] }).leads[0];
    expect(ownerRow.contact_hidden).toBe(false);
    expect(ownerRow.phone).toBe('0100 111 2222');

    const viewer = await leadsHandler(consoleRequest(`?q=${encodeURIComponent('BK17 Booking')}`, read(actors.Viewer)));
    const viewerRow = ((await viewer.json()) as { leads: LeadRow[] }).leads[0];
    expect(viewerRow.id).toBe(ownerRow.id);
    expect(viewerRow.contact_hidden).toBe(true);
    expect(viewerRow.name).toBe('');
    expect(viewerRow.phone).toBe('');
    expect(viewerRow.email).toBe('');
    expect(viewerRow.message).toBeNull();
    expect(viewerRow.fields).toBeNull();
    expect(viewerRow.editable).toBe(false);
  });

  it('withholds the notes with the contact fields', async () => {
    const owner = await leadsHandler(
      consoleRequest(`/${bookingId}/notes?source=booking`, write(actors.Owner, 'POST', { body: 'Called back, prefers Tuesday' })),
    );
    expect(owner.status).toBe(200);
    const note = ((await owner.json()) as { note: LeadNote }).note;
    expect(note.author).toBe('BK17 Owner');

    const ownerRead = await leadsHandler(consoleRequest(`/${bookingId}`, read(actors.Owner)));
    expect(((await ownerRead.json()) as { notes: LeadNote[] }).notes).toHaveLength(1);

    const viewerRead = await leadsHandler(consoleRequest(`/${bookingId}`, read(actors.Viewer)));
    const viewerBody = (await viewerRead.json()) as { lead: LeadRow; notes: LeadNote[] };
    expect(viewerBody.notes).toEqual([]);
    expect(viewerBody.lead.contact_hidden).toBe(true);
  });

  it('shows a source-scoped worker only the source it can act on', () => {
    const [booking, contact] = [
      leadRow(actors.Scoped.grants, {
        id: 'a', source: 'booking', formId: '', name: 'A', phone: '1', email: '', message: null, fields: null,
        status: 'new', assigneeId: null, locale: 'ar', pagePath: '', referrer: '', utm: null,
        landingPage: '', firstReferrer: '', gclid: '', fbclid: '', device: 'unknown', city: '',
        campaign: { source: '', medium: '', campaign: '', term: '', content: '' },
        sessionHash: null, visitorHash: null,
        createdAt: '', updatedAt: '', spam: false,
      }),
      leadRow(actors.Scoped.grants, {
        id: 'b', source: 'contact-form', formId: '', name: 'B', phone: '2', email: '', message: null, fields: null,
        status: 'new', assigneeId: null, locale: 'ar', pagePath: '', referrer: '', utm: null,
        landingPage: '', firstReferrer: '', gclid: '', fbclid: '', device: 'unknown', city: '',
        campaign: { source: '', medium: '', campaign: '', term: '', content: '' },
        sessionHash: null, visitorHash: null,
        createdAt: '', updatedAt: '', spam: false,
      }),
    ];
    expect(booking.contact_hidden).toBe(false);
    expect(booking.editable).toBe(true);
    // The grant names `leadSources: ['booking']`, so the other source is contact-hidden
    // *and* not editable — the same rule, read twice.
    expect(contact.contact_hidden).toBe(true);
    expect(contact.editable).toBe(false);
  });
});

describe('working a lead (BK-17a)', () => {
  it('moves a status inside the source and audits it', async () => {
    const res = await leadsHandler(
      consoleRequest(`/${bookingId}?source=booking`, write(actors.Scoped, 'PATCH', { status: 'contacted' })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lead: LeadRow };
    expect(body.lead.status).toBe('contacted');

    const stored = await getLead(bookingId);
    expect(stored?.status).toBe('contacted');

    const audit = await db
      .selectFrom('audit_log')
      .selectAll()
      .where('entity_id', '=', bookingId)
      .where('action', '=', 'lead.update')
      .where('actor_email', '=', actors.Scoped.email)
      .execute();
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a pasted id from another source', async () => {
    const res = await leadsHandler(
      consoleRequest(`/${contactId}?source=booking`, write(actors.Scoped, 'PATCH', { status: 'booked' })),
    );
    expect(res.status).toBe(404);
    expect((await getLead(contactId))?.status).toBe('new');
  });

  it('refuses a source the caller does not hold at all', async () => {
    const res = await leadsHandler(
      consoleRequest(`/${bookingId}?source=contact-form`, write(actors.Scoped, 'PATCH', { status: 'lost' })),
    );
    expect(res.status).toBe(403);
    expect((await getLead(bookingId))?.status).toBe('contacted');
  });

  it('rejects a status outside the pipeline after permission is granted', async () => {
    const res = await leadsHandler(
      consoleRequest(`/${bookingId}?source=booking`, write(actors.Scoped, 'PATCH', { status: 'archived' })),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_input');
  });

  it('keeps notes on the source side too', async () => {
    const denied = await leadsHandler(
      consoleRequest(`/${contactId}/notes?source=booking`, write(actors.Scoped, 'POST', { body: 'not mine' })),
    );
    expect(denied.status).toBe(404);
  });
});

describe('the list the screen is built from (BK-17a)', () => {
  it('filters by status, source and free text, and counts the chips under the filter', async () => {
    const byStatus = await leadsHandler(consoleRequest('?status=contacted', read(actors.Owner)));
    const statusBody = (await byStatus.json()) as { leads: LeadRow[]; total: number; counts: Record<string, number> };
    expect(statusBody.leads.every((row) => row.status === 'contacted')).toBe(true);
    expect(statusBody.leads.some((row) => row.id === bookingId)).toBe(true);
    // Counts ignore the chosen status but keep the source and search, because a chip
    // showing "0" would be a chip nobody could ever press.
    expect(statusBody.counts.contacted).toBeGreaterThanOrEqual(1);

    const bySource = await leadsHandler(consoleRequest('?source=contact-form', read(actors.Owner)));
    const sourceBody = (await bySource.json()) as { leads: LeadRow[]; counts: Record<string, number>; total: number };
    expect(sourceBody.leads.every((row) => row.source === 'contact-form')).toBe(true);
    expect(sourceBody.leads.some((row) => row.id === contactId)).toBe(true);
    expect(sourceBody.counts.all).toBe(sourceBody.total);

    const byText = await leadsHandler(consoleRequest('?q=555', read(actors.Owner)));
    const textBody = (await byText.json()) as { leads: LeadRow[] };
    expect(textBody.leads.some((row) => row.id === contactId)).toBe(true);
    expect(textBody.leads.every((row) => row.id !== bookingId)).toBe(true);
  });

  it('pages a filtered list and clamps a page past the end', async () => {
    const first = await leadsHandler(consoleRequest(`?q=${encodeURIComponent('BK17')}&per=1&page=1`, read(actors.Owner)));
    const firstBody = (await first.json()) as { leads: LeadRow[]; page: number; pages: number; per: number; total: number };
    expect(firstBody.per).toBe(1);
    expect(firstBody.pages).toBe(firstBody.total);
    expect(firstBody.leads).toHaveLength(1);

    const past = await leadsHandler(consoleRequest(`?q=${encodeURIComponent('BK17')}&per=1&page=999`, read(actors.Owner)));
    const pastBody = (await past.json()) as { page: number; pages: number };
    expect(pastBody.page).toBe(pastBody.pages);
  });

  it('parses the view defensively, because it comes from the address bar', () => {
    expect(parseLeadsView({ status: 'nonsense', per: '0', page: '-4' })).toMatchObject({ status: null, per: 25, page: 1 });
    expect(parseLeadsView({ status: 'booked', per: '1000', page: '2', q: '  Ali  ' })).toMatchObject({
      status: 'booked',
      per: 100,
      page: 2,
      q: 'Ali',
    });
    expect(parseLeadsView(undefined).status).toBeNull();
  });

  it('hands the screen the first row’s notes only when the caller may see them', async () => {
    const owner = await leadsScreenData({ view: { status: null, source: null, q: '', page: 1, per: 25 }, grants: actors.Owner.grants });
    expect(owner.writable).toBe(true);
    expect(owner.rows.length).toBeGreaterThan(0);

    const viewer = await leadsScreenData({ view: { status: null, source: null, q: '', page: 1, per: 25 }, grants: actors.Viewer.grants });
    expect(viewer.notes).toEqual([]);
    expect(viewer.rows.every((row) => row.contact_hidden)).toBe(true);
  });
});
