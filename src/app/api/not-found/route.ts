import { recordNotFound } from "@/lib/content/not-found-log";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";

/**
 * The beacon from a not-found page a route answered with `notFound()`. Public, so it takes
 * only what it can check: a same-site request (by Origin, when the browser sends one) and a
 * rooted path. `recordNotFound` drops scanner probes and caps the table.
 */
export async function POST(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const self = new URL(req.url).origin;
  if (origin && origin !== self && origin !== new URL(SITE_URL).origin) return new Response(null, { status: 403 });
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 2000));
  } catch {
    return new Response(null, { status: 400 });
  }
  const { path, referrer } = (body ?? {}) as { path?: unknown; referrer?: unknown };
  if (typeof path !== "string" || !path.startsWith("/")) return new Response(null, { status: 400 });
  await recordNotFound(path, typeof referrer === "string" ? referrer : null);
  return new Response(null, { status: 204 });
}
