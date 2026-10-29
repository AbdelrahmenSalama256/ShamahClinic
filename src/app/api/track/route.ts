/**
 * `POST /api/track` — the site's own measurement endpoint.
 *
 * Public by design (a visitor is not signed in), so the validation is the gate: a
 * same-origin check, a refusing answer for DNT/Sec-GPC, a rate limit, a closed list of
 * event names and a payload schema. Nothing here can name a person: the raw address is
 * only hashed against the day and never stored, and the body has no field for a name,
 * phone, email or free text beyond the small event `meta` map.
 *
 * The answer is 204 even when the row is not written. A tracking call that fails must
 * be invisible to the page; the browser has no error state to show and no retry to do.
 */
import { after, NextResponse } from 'next/server';
import {
  privacyRefused,
  rateLimited,
  readTrackContext,
  recordEvent,
  trackSchema,
} from '@/lib/tracking/ingest';
import { maintain } from '@/lib/tracking/rollup';

export const runtime = 'nodejs';

function noContent(): Response {
  return new NextResponse(null, { status: 204 });
}

const MAINTAIN_EVERY_MS = 30 * 60_000;
let lastMaintenance = 0;
let maintaining = false;

/**
 * Yesterday's totals are built here rather than by a cron the host may not offer. An
 * idle site simply catches up on its first request; a failing database is retried by
 * the next request instead of being abandoned until tomorrow.
 */
function scheduleMaintenance(): void {
  if (maintaining || Date.now() - lastMaintenance < MAINTAIN_EVERY_MS) return;
  lastMaintenance = Date.now();
  maintaining = true;
  const run = async (): Promise<void> => {
    try {
      await maintain();
    } catch {
      lastMaintenance = 0;
      console.error('[track] daily rollup did not finish');
    } finally {
      maintaining = false;
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

export async function POST(req: Request): Promise<Response> {
  const headers = req.headers;

  // The site's own pages only. An empty Origin is allowed because a same-origin
  // sendBeacon in some browsers omits it; the rate limit covers what that leaves open.
  const origin = headers.get('origin');
  const host = headers.get('host') ?? new URL(req.url).host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ ok: false }, { status: 403 });
    } catch {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  if (privacyRefused(headers)) return noContent();

  const declared = Number(headers.get('content-length') ?? '0');
  if (declared > 8_192) return NextResponse.json({ ok: false }, { status: 413 });

  const ctx = readTrackContext(headers);
  if (rateLimited(ctx.ip || `host:${host}`)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  try {
    await recordEvent(parsed.data, ctx);
  } catch {
    // A full table or a dropped connection is not the visitor's problem.
    console.error('[track] event was not recorded');
  }
  scheduleMaintenance();
  return noContent();
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
}
