import { getServiceCards } from "@/lib/content/site";
import { ok, fail, readQuery } from "@/lib/http-api";

export async function GET(req: Request) {
  try {
    const cards = await getServiceCards();
    const { search } = readQuery(req);
    const filtered = search
      ? cards.filter((c) =>
          `${c.title.ar} ${c.title.en} ${c.intro.ar} ${c.intro.en}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
      : cards;
    return ok(filtered);
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "services unavailable");
  }
}
