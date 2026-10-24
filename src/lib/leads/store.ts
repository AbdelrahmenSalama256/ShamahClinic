/**
 * The lead pipeline: what the two public forms write, and what the console reads.
 *
 * A lead is not content. It has no draft, no revision and no publish step — the row
 * a visitor sends is the row the clinic works — so it does not go through
 * `src/lib/content/*`. It keeps the two habits that matter here anyway: every
 * request value is a bind parameter, and no read returns a column a grant did not
 * earn (that part lives in `src/lib/auth/redaction.ts` and is applied by ./api.ts).
 *
 * The two public forms are the only writers, and a visitor must never lose their
 * WhatsApp link because the database is down, so `recordLead` is called behind a
 * best-effort catch in `/api/v1/lead` rather than in the visitor's path.
 */
import { randomUUID } from 'node:crypto';
import { sql, type RawBuilder, type SqlBool } from 'kysely';
import { db } from '../db';
import { json } from '../db/json';
import { likeOf } from '../db/like';
import { isLeadStatus, LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus } from './kinds';

export { isLeadStatus, LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus };

/** One submission, as the public route knows it. */
export interface LeadRecordInput {
  source: string;
  formId?: string;
  name: string;
  phone: string;
  email?: string;
  message?: string | null;
  fields?: Record<string, unknown> | null;
  locale?: string;
  pagePath?: string;
  referrer?: string;
  utm?: Record<string, string> | null;
  /** A client-supplied key; omitted, a deterministic one is used so a double tap is one row. */
  idempotencyKey?: string;
}

/** A lead as the console reads it. `contact_hidden` is added by the redaction step. */
export interface LeadRecord {
  id: string;
  source: string;
  formId: string;
  name: string;
  phone: string;
  email: string;
  message: string | null;
  fields: Record<string, unknown> | null;
  status: LeadStatus;
  assigneeId: string | null;
  locale: string;
  pagePath: string;
  referrer: string;
  utm: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  spam: boolean;
}

export interface LeadNote {
  id: string;
  leadId: string;
  authorId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface LeadCounts {
  all: number;
  new: number;
  contacted: number;
  booked: number;
  done: number;
  lost: number;
}

export interface LeadQuery {
  status: LeadStatus | null;
  source: string | null;
  q: string;
  page: number;
  per: number;
}

export interface LeadPage {
  rows: LeadRecord[];
  total: number;
  /** the page actually shown, after clamping a page past the end back to the last one */
  page: number;
  pages: number;
  per: number;
  /** the status distribution under the current source and search, for the filter chips */
  counts: LeadCounts;
}

const PER_DEFAULT = 25;
const PER_MAX = 100;

/** One id, or a duplicate-key race: the key is the row a retried submission already made. */
function isDuplicateKey(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ER_DUP_ENTRY' || code === 'ER_DUP_ENTRY_WITH_KEY_NAME';
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

/** MariaDB keeps JSON as text; a raw select can hand back either shape. */
function asJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

interface LeadRowShape {
  id: unknown;
  source: unknown;
  form_id: unknown;
  name: unknown;
  phone: unknown;
  email: unknown;
  message: unknown;
  fields: unknown;
  status: unknown;
  assignee_id: unknown;
  locale: unknown;
  page_path: unknown;
  referrer: unknown;
  utm: unknown;
  created_at: unknown;
  updated_at: unknown;
  spam: unknown;
}

function mapLead(row: LeadRowShape): LeadRecord {
  return {
    id: text(row.id),
    source: text(row.source),
    formId: text(row.form_id),
    name: text(row.name),
    phone: text(row.phone),
    email: text(row.email),
    message: row.message === null || row.message === undefined ? null : String(row.message),
    fields: asJson<Record<string, unknown>>(row.fields),
    status: isLeadStatus(row.status) ? row.status : 'new',
    assigneeId: row.assignee_id === null || row.assignee_id === undefined ? null : String(row.assignee_id),
    locale: text(row.locale) || 'ar',
    pagePath: text(row.page_path),
    referrer: text(row.referrer),
    utm: asJson<Record<string, string>>(row.utm),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    spam: Number(row.spam ?? 0) === 1,
  };
}

/**
 * Write one submission. A retry with the same key returns the row that already
 * exists instead of a second lead, so a double-tapped booking is one phone call.
 */
export async function recordLead(input: LeadRecordInput): Promise<{ id: string; duplicate: boolean }> {
  const id = randomUUID();
  const key = (input.idempotencyKey?.trim() || id).slice(0, 120);

  try {
    await db
      .insertInto('leads')
      .values({
        id,
        source: input.source.slice(0, 64),
        form_id: (input.formId ?? '').slice(0, 64),
        name: input.name.slice(0, 255),
        phone: input.phone.slice(0, 64),
        email: (input.email ?? '').slice(0, 255),
        message: input.message?.trim() ? input.message.trim() : null,
        fields: input.fields ? json(input.fields) : null,
        locale: (input.locale ?? 'ar').slice(0, 5),
        page_path: (input.pagePath ?? '').slice(0, 512),
        referrer: (input.referrer ?? '').slice(0, 512),
        utm: input.utm && Object.keys(input.utm).length > 0 ? json(input.utm) : null,
        idempotency_key: key,
      })
      .execute();
    return { id, duplicate: false };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const found = await db.selectFrom('leads').select('id').where('idempotency_key', '=', key).executeTakeFirst();
    return { id: found?.id ?? id, duplicate: true };
  }
}

const COLUMNS = [
  'id',
  'source',
  'form_id',
  'name',
  'phone',
  'email',
  'message',
  'fields',
  'status',
  'assignee_id',
  'locale',
  'page_path',
  'referrer',
  'utm',
  'created_at',
  'updated_at',
  'spam',
] as const;

/** One lead, or null when it never existed or has been removed. */
export async function getLead(id: string): Promise<LeadRecord | null> {
  const row = await db
    .selectFrom('leads')
    .select(COLUMNS)
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? mapLead(row as unknown as LeadRowShape) : null;
}

/** The filters shared by the page, the count and the chip distribution. */
function filtersOf(query: Pick<LeadQuery, 'source' | 'q'>): RawBuilder<SqlBool>[] {
  const where: RawBuilder<SqlBool>[] = [sql<SqlBool>`${sql.ref('deleted_at')} IS NULL`];
  if (query.source) where.push(sql<SqlBool>`${sql.ref('source')} = ${query.source}`);
  if (query.q) {
    const needle = likeOf(query.q);
    where.push(
      sql<SqlBool>`(${sql.ref('name')} LIKE ${needle} OR ${sql.ref('phone')} LIKE ${needle} OR ${sql.ref('email')} LIKE ${needle} OR ${sql.ref('message')} LIKE ${needle})`,
    );
  }
  return where;
}

/** One page of leads, newest first, with the counts the filter chips print. */
export async function listLeads(query: LeadQuery): Promise<LeadPage> {
  const where = filtersOf(query);
  const per = Math.min(PER_MAX, Math.max(1, Math.trunc(query.per) || PER_DEFAULT));
  const statusWhere = query.status ? [...where, sql<SqlBool>`${sql.ref('status')} = ${query.status}`] : where;

  const counted = await db
    .selectFrom('leads')
    .select(sql<number>`COUNT(*)`.as('total'))
    .where(sql<SqlBool>`(${sql.join(statusWhere, sql` AND `)})`)
    .executeTakeFirst();
  const total = Number(counted?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, Math.trunc(query.page) || 1), pages);

  const distribution = await db
    .selectFrom('leads')
    .select([sql<string>`${sql.ref('status')}`.as('status'), sql<number>`COUNT(*)`.as('n')])
    .where(sql<SqlBool>`(${sql.join(where, sql` AND `)})`)
    .groupBy(sql.ref('status'))
    .execute();

  const counts: LeadCounts = { all: 0, new: 0, contacted: 0, booked: 0, done: 0, lost: 0 };
  for (const row of distribution) {
    const n = Number(row.n ?? 0);
    counts.all += n;
    if (isLeadStatus(row.status)) counts[row.status] += n;
  }

  const rows = await db
    .selectFrom('leads')
    .select(COLUMNS)
    .where(sql<SqlBool>`(${sql.join(statusWhere, sql` AND `)})`)
    .orderBy(sql.ref('created_at'), 'desc')
    .orderBy(sql.ref('id'), 'desc')
    .limit(per)
    .offset((page - 1) * per)
    .execute();

  return {
    rows: rows.map((row) => mapLead(row as unknown as LeadRowShape)),
    total,
    page,
    pages,
    per,
    counts,
  };
}

/** Move a lead along the pipeline. Returns the row as it now stands, or null if it is gone. */
export async function setLeadStatus(input: { id: string; status: LeadStatus; actorId: string }): Promise<LeadRecord | null> {
  const result = await db
    .updateTable('leads')
    .set({ status: input.status, updated_by: input.actorId })
    .where('id', '=', input.id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows ?? 0) === 0) return null;
  return getLead(input.id);
}

export async function addLeadNote(input: { leadId: string; authorId: string; body: string }): Promise<LeadNote> {
  const id = randomUUID();
  await db
    .insertInto('lead_notes')
    .values({ id, lead_id: input.leadId, author_id: input.authorId, body: input.body.slice(0, 2000) })
    .execute();
  const row = await db
    .selectFrom('lead_notes')
    .leftJoin('users', 'users.id', 'lead_notes.author_id')
    .select([
      sql.ref('lead_notes.id').as('id'),
      sql.ref('lead_notes.lead_id').as('lead_id'),
      sql.ref('lead_notes.author_id').as('author_id'),
      sql<string>`COALESCE(${sql.ref('users.name')}, '')`.as('author'),
      sql.ref('lead_notes.body').as('body'),
      sql.ref('lead_notes.created_at').as('created_at'),
    ])
    .where('lead_notes.id', '=', id)
    .executeTakeFirst();
  return {
    id,
    leadId: input.leadId,
    authorId: input.authorId,
    author: text(row?.author),
    body: text(row?.body ?? input.body),
    createdAt: toIso(row?.created_at ?? new Date()),
  };
}

export async function leadNotes(leadId: string): Promise<LeadNote[]> {
  const rows = await db
    .selectFrom('lead_notes')
    .leftJoin('users', 'users.id', 'lead_notes.author_id')
    .select([
      sql.ref('lead_notes.id').as('id'),
      sql.ref('lead_notes.lead_id').as('lead_id'),
      sql.ref('lead_notes.author_id').as('author_id'),
      sql<string>`COALESCE(${sql.ref('users.name')}, '')`.as('author'),
      sql.ref('lead_notes.body').as('body'),
      sql.ref('lead_notes.created_at').as('created_at'),
    ])
    .where('lead_notes.lead_id', '=', leadId)
    .orderBy(sql.ref('lead_notes.created_at'), 'asc')
    .execute();
  return rows.map((row) => ({
    id: text(row.id),
    leadId: text(row.lead_id),
    authorId: text(row.author_id),
    author: text(row.author),
    body: text(row.body),
    createdAt: toIso(row.created_at),
  }));
}
