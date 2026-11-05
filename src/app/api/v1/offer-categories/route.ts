import { getOfferCategories } from "@/lib/wp";
import { ok, fail } from "@/lib/http-api";

export async function GET() {
  try {
    return ok(await getOfferCategories());
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "offer categories unavailable");
  }
}
