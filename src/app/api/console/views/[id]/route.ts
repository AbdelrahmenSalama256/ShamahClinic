import { viewItemHandler } from '@/lib/console/views-route';

export const runtime = 'nodejs';

/** Forget a saved filter. Nothing else is in `@/lib/console/views-route`. */
export async function DELETE(req: Request): Promise<Response> {
  return viewItemHandler(req);
}
