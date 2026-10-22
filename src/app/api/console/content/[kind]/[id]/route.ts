import { contentItemHandler } from '@/lib/content/api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return contentItemHandler(req);
}

/** Save one locale's draft. */
export async function PATCH(req: Request): Promise<Response> {
  return contentItemHandler(req);
}

/** Soft delete: the row keeps its id, version and revisions. */
export async function DELETE(req: Request): Promise<Response> {
  return contentItemHandler(req);
}
