import { getBranches } from "@/lib/wp";
import { ok } from "@/lib/http-api";

export async function GET() {
  return ok(await getBranches());
}
