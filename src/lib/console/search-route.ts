/**
 * `GET /api/console/search?q=` — the palette's record half.
 *
 * The query string goes through the same zod path a body does (`inputFrom`), so an
 * over-long or one-character term is a 400 with an `issues[].path`, not a table scan.
 * A caller with none of the three reads gets the 403 `guard` answers before anything
 * is parsed; a caller with one of them gets hits from one of them and no query for
 * the rest.
 */
import { z } from 'zod';
import { guard } from '../auth/guard';
import { SEARCH_RESOURCES, searchRows } from './search';

const schema = z.object({
  q: z.string().trim().min(2).max(80),
});

export async function searchHandler(req: Request): Promise<Response> {
  return guard(
    req,
    {
      resource: SEARCH_RESOURCES,
      action: 'read',
      schema,
      inputFrom: (request) => Object.fromEntries(new URL(request.url).searchParams),
    },
    async ({ input, resources }) => ({
      data: { hits: await searchRows(resources, input.q) },
    }),
  );
}
