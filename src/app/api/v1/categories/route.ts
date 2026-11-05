import { getCategories } from "@/lib/content/site";
import { ok, fail } from "@/lib/http-api";

export async function GET() {
  try {
    return ok(await getCategories());
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "categories unavailable");
  }
}
