/**
 * One shape for a lead as either half of the screen sees it.
 *
 * The server page, the list endpoint and the detail endpoint all answer with the
 * same annotated row — `contact_hidden` from the redaction rule and `editable` from
 * the caller's grant on *that* lead's source — so a row refreshed in the browser
 * cannot lose a field the server-rendered copy had.
 */
import { can, type Grant } from '../auth/permissions';
import { leadContactVisible, redactLead } from '../auth/redaction';
import {
  isLeadStatus,
  leadNotes,
  listLeads,
  type LeadNote,
  type LeadPage,
  type LeadQuery,
  type LeadRecord,
  type LeadStatus,
} from './store';

export interface LeadRow extends LeadRecord {
  contact_hidden: boolean;
  /** this caller may move this lead's status and write notes on it */
  editable: boolean;
}

export interface LeadsView {
  status: LeadStatus | null;
  source: string | null;
  q: string;
  page: number;
  per: number;
}

export function leadRow(grants: readonly Grant[], lead: LeadRecord): LeadRow {
  const redacted = redactLead(grants, lead);
  return {
    ...redacted,
    editable: can(grants, 'lead', 'update', { leadSources: lead.source }),
  };
}

/** The search terms a console page is handed, parsed once — the URL is the state. */
export function parseLeadsView(search: Record<string, string | string[] | undefined> | undefined): LeadsView {
  const first = (name: string): string => {
    const value = search?.[name];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };
  const status = first('status');
  return {
    status: isLeadStatus(status) ? status : null,
    source: first('source').slice(0, 64) || null,
    q: first('q').slice(0, 120),
    page: Math.max(1, Number(first('page')) || 1),
    per: Math.min(100, Math.max(1, Number(first('per')) || 25)),
  };
}

export interface LeadsScreenData {
  view: LeadsView;
  rows: LeadRow[];
  /** the first row's notes, so the detail pane is real on the first paint */
  notes: LeadNote[];
  total: number;
  page: number;
  pages: number;
  per: number;
  counts: LeadPage['counts'];
  /** at least one status move or note is possible somewhere on this screen */
  writable: boolean;
  /** a download is allowed by a grant that covers at least one source on this page */
  canExport: boolean;
}

export async function leadsScreenData(input: {
  view: LeadsView;
  grants: readonly Grant[];
}): Promise<LeadsScreenData> {
  const { view, grants } = input;
  const query: LeadQuery = view;
  const page = await listLeads(query);
  const rows = page.rows.map((lead) => leadRow(grants, lead));
  const first = page.rows[0];
  return {
    view,
    rows,
    notes: first && leadContactVisible(grants, first) ? await leadNotes(first.id) : [],
    total: page.total,
    page: page.page,
    pages: page.pages,
    per: page.per,
    counts: page.counts,
    writable: rows.some((row) => row.editable) || can(grants, 'lead', 'update', {}),
    // An unscoped grant covers every source; a scoped one covers a download only when
    // the page actually shows a lead from that source — otherwise the button would 403.
    canExport:
      can(grants, 'lead', 'export', {}) ||
      rows.some((row) => can(grants, 'lead', 'export', { leadSources: row.source })),
  };
}

export { leadContactVisible };
