/**
 * The leads API the console calls — a `Request` in, a `Response` out, every route
 * through `guard()`.
 *
 * Two choices worth stating:
 *
 *   - A write names the lead's source in the query string (`?source=`), because
 *     `guard()` decides permission before it reads a payload and the only dimension
 *     a lead grant can be narrowed by is `leadSources`. The handler then checks the
 *     loaded row really has that source, so a pasted id cannot borrow another
 *     source's grant.
 *   - Every row leaves through `redactLead()`. A Viewer may read that a lead exists
 *     and what state it is in; a phone number is only for the grant that can act on
 *     it. Notes are withheld with the contact fields, because a note is where staff
 *     paste exactly the details the rule hides.
 */
import { z } from 'zod';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { leadContactVisible } from '../auth/redaction';
import { countGoogleAdsRows, countLeadRows, googleAdsCsvStream, leadCsvStream } from './export';
import {
  addLeadNote,
  getLead,
  isLeadStatus,
  leadNotes,
  listLeads,
  setLeadStatus,
  LEAD_STATUSES,
  type LeadNote,
  type LeadRecord,
} from './store';
import { leadRow } from './view';

type Body = Record<string, unknown>;

interface Route {
  id: string | null;
  notes: boolean;
}

/** `/api/console/leads[/<id>[/notes]]` */
function parseRoute(url: string): Route | null {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const at = segments.indexOf('leads');
  if (at === -1) return null;
  const [id, tail] = segments.slice(at + 1);
  if (!id) return { id: null, notes: false };
  if (!tail) return { id, notes: false };
  if (tail === 'notes') return { id, notes: true };
  return null;
}

function param(req: Request, name: string): string {
  return (new URL(req.url).searchParams.get(name) ?? '').trim();
}

function notFound(): GuardResult<Body> {
  return { status: 404, data: { error: 'not_found' } };
}

/** The source a write names, which the guard reads before the body. */
function sourceOf(req: Request): string {
  return param(req, 'source').slice(0, 64);
}

async function listHandler(req: Request): Promise<Response> {
  return guard(req, { resource: 'lead', action: 'read' }, async (ctx): Promise<GuardResult<Body>> => {
    const status = param(req, 'status');
    const page = await listLeads({
      status: isLeadStatus(status) ? status : null,
      source: param(req, 'source').slice(0, 64) || null,
      q: param(req, 'q').slice(0, 120),
      page: Number(param(req, 'page')) || 1,
      per: Number(param(req, 'per')) || 25,
    });
    return {
      data: {
        leads: page.rows.map((row) => leadRow(ctx.auth.user.grants, row)),
        total: page.total,
        page: page.page,
        pages: page.pages,
        per: page.per,
        counts: page.counts,
      },
    };
  });
}

async function readHandler(req: Request, id: string): Promise<Response> {
  return guard(req, { resource: 'lead', action: 'read' }, async (ctx): Promise<GuardResult<Body>> => {
    const lead = await getLead(id);
    if (!lead) return notFound();
    // A note is free text and may hold a phone number, so it is contact data too.
    const notes = leadContactVisible(ctx.auth.user.grants, lead) ? await leadNotes(id) : [];
    return { data: { lead: leadRow(ctx.auth.user.grants, lead), notes } };
  });
}

const statusSchema = z.object({ status: z.enum(LEAD_STATUSES) });

async function statusHandler(req: Request, id: string): Promise<Response> {
  return guard<z.output<typeof statusSchema>, Body>(
    req,
    {
      resource: 'lead',
      action: 'update',
      schema: statusSchema,
      target: (request) => ({ leadSources: sourceOf(request) }),
    },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await getLead(id);
      // The guard checked the grant against the source the request *named*; this is
      // the check that the lead really is that source.
      if (!before || before.source !== ctx.target.leadSources) return notFound();
      const row = await setLeadStatus({ id, status: ctx.input.status, actorId: ctx.auth.user.id });
      if (!row) return notFound();
      return {
        data: { lead: leadRow(ctx.auth.user.grants, row) },
        audit: { entityType: 'lead', entityId: id, before, after: row },
      };
    },
  );
}

const noteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

async function notesHandler(req: Request, id: string): Promise<Response> {
  return guard<z.output<typeof noteSchema>, Body>(
    req,
    {
      resource: 'lead',
      action: 'update',
      schema: noteSchema,
      target: (request) => ({ leadSources: sourceOf(request) }),
    },
    async (ctx): Promise<GuardResult<Body>> => {
      const lead = await getLead(id);
      if (!lead || lead.source !== ctx.target.leadSources) return notFound();
      const note: LeadNote = await addLeadNote({ leadId: id, authorId: ctx.auth.user.id, body: ctx.input.body });
      return {
        data: { note },
        audit: { entityType: 'lead', entityId: id, after: { note: note.id } },
      };
    },
  );
}

/** `GET /api/console/leads`, `GET|PATCH /api/console/leads/<id>`, `POST /api/console/leads/<id>/notes` */
export async function leadsHandler(req: Request): Promise<Response> {
  const route = parseRoute(req.url);
  if (!route) return jsonError(404, 'unknown_route');

  if (!route.id) {
    if (req.method === 'GET') return listHandler(req);
    return jsonError(405, 'method_not_allowed');
  }

  if (route.notes) {
    if (req.method === 'POST') return notesHandler(req, route.id);
    return jsonError(405, 'method_not_allowed');
  }

  if (req.method === 'GET') return readHandler(req, route.id);
  if (req.method === 'PATCH') return statusHandler(req, route.id);
  return jsonError(405, 'method_not_allowed');
}

export type { LeadNote, LeadRecord };

/**
 * `GET /api/console/leads/export?format=csv|google-ads&from=&to=&source=&status=&q=`
 *
 * A download is a read of every contact detail the clinic has, which is why it is its
 * own action (`lead.export`), not `lead.read`. The response is streamed from batches so a
 * year of leads never sits in memory, and the audit row is written before the first byte
 * leaves — an export that is aborted halfway still happened.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayParam(req: Request, name: string): string {
  const value = param(req, name);
  return DAY.test(value) ? value : '';
}

export async function leadExportHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return jsonError(405, 'method_not_allowed');
  return guard(req, { resource: 'lead', action: 'export', target: (request) => ({ leadSources: sourceOf(request) }) }, async (ctx) => {
    const format = param(req, 'format') === 'google-ads' ? 'google-ads' : 'csv';
    const status = param(req, 'status');
    const filters = {
      from: dayParam(req, 'from'),
      to: dayParam(req, 'to'),
      source: sourceOf(req),
      status: isLeadStatus(status) ? status : null,
      q: param(req, 'q').slice(0, 120),
    };
    const rows = format === 'google-ads' ? await countGoogleAdsRows(filters) : await countLeadRows(filters);
    // Counts and filters only: the audit log must not become a second copy of the leads.
    const summary = {
      format,
      from: filters.from,
      to: filters.to,
      source: filters.source,
      status: filters.status,
      filtered: Boolean(filters.q),
      rows,
    };
    const body = format === 'google-ads' ? googleAdsCsvStream(filters) : leadCsvStream(filters, ctx.auth.user.grants);
    const name = `${format === 'google-ads' ? 'google-ads-offline' : 'leads'}-${new Date().toISOString().slice(0, 10)}.csv`;
    return {
      data: summary,
      audit: { entityType: 'lead', after: summary },
      response: new Response(body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      }),
    };
  });
}
