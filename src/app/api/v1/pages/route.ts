import { getPages } from "@/lib/content/site";
import { ok, fail, readQuery } from "@/lib/http-api";

export async function GET(req: Request) {
  try {
    return ok(await getPages(readQuery(req)));
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "pages unavailable");
  }
}
