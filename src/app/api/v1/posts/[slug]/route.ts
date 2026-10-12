import { getPost } from "@/lib/wp";
import { ok, fail, slugParam } from "@/lib/http-api";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const result = await getPost(await slugParam(ctx));
    if (!result) return fail(404, "post not found");
    return ok(result);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "post unavailable");
  }
}
