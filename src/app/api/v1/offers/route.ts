import { getOffers } from "@/lib/wp";
import { ok, fail, readQuery } from "@/lib/http-api";

export async function GET(req: Request) {
  try {
    const q = readQuery(req);
    return ok(await getOffers(q, q.lang ?? "en"));
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "offers unavailable");
  }
}
