import { getBranches } from "@/lib/content/site";
import { ok } from "@/lib/http-api";

export async function GET() {
  return ok(await getBranches());
}
