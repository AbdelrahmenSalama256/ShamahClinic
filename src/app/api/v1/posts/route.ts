import { getPosts } from "@/lib/content/site";
import { ok, fail, readQuery } from "@/lib/http-api";

export async function GET(req: Request) {
  try {
    return ok(await getPosts(readQuery(req)));
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "posts unavailable");
  }
}
