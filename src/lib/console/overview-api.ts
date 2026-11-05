/**
 * `/api/console/overview` and `/api/console/overview/export`.
 *
 * A read is one aggregate round on the server (see `./overview.ts`), so the browser
 * never holds a table: it asks for a range and gets the numbers the screen draws.
 * The download is the same read under `stat.export` — a different grant from
 * `stat.read`, because a file leaves the building and is worth recording — and the
 * audit row names the range and the row count, never the numbers themselves.
 */
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { clearOverviewCache, overviewData, parseOverviewQuery, type OverviewData, type OverviewIssue } from './overview';
import { overviewCsv } from './overview-export';

/** A read answers with the screen's data, or with why the query was refused. */
type OverviewBody = OverviewData | { error: 'invalid_input'; issues: OverviewIssue[] };

export async function overviewHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return jsonError(405, 'method_not_allowed');
  return guard(req, { resource: 'stat', action: 'read' }, async (ctx): Promise<GuardResult<OverviewBody>> => {
    const search = new URL(req.url).searchParams;
    const query = parseOverviewQuery(search);
    if ('error' in query) return { status: 400, data: query };
    // "Refresh" is the one request allowed past the minute: the person asked for now.
    if ((search.get('refresh') ?? '') === '1') clearOverviewCache();
    return { data: await overviewData({ query, grants: ctx.auth.user.grants }) };
  });
}

interface ExportSummary {
  format: 'csv';
  range: string;
  from: string;
  to: string;
  compare: boolean;
  rows: number;
}

export async function overviewExportHandler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return jsonError(405, 'method_not_allowed');
  return guard(req, { resource: 'stat', action: 'export' }, async (ctx): Promise<GuardResult<ExportSummary | OverviewBody>> => {
    const query = parseOverviewQuery(new URL(req.url).searchParams);
    if ('error' in query) return { status: 400, data: query };

    const data = await overviewData({ query, grants: ctx.auth.user.grants });
    const { csv, rows } = overviewCsv(data);
    const summary: ExportSummary = {
      format: 'csv',
      range: query.range.key,
      from: data.range.from,
      to: data.range.to,
      compare: query.compare,
      rows,
    };
    const name = `overview-${data.range.from}-${data.range.to}.csv`;
    return {
      data: summary,
      audit: { entityType: 'stat', after: summary },
      response: new Response(csv, {
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
