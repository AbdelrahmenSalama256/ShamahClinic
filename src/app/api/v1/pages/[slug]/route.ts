import { getPage } from "@/lib/content/site";
import { ok, fail, slugParam } from "@/lib/http-api";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const result = await getPage(await slugParam(ctx));
    if (!result) return fail(404, "page not found");
    return ok(result);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "page unavailable");
  }
}
