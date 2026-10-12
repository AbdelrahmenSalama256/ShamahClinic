import { getOffer } from "@/lib/wp";
import { ok, fail, readQuery, slugParam } from "@/lib/http-api";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const result = await getOffer(await slugParam(ctx), readQuery(req).lang ?? "en");
    if (!result) return fail(404, "offer not found");
    return ok(result);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "offer unavailable");
  }
}
