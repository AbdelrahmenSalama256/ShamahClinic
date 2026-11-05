import { copyHandler } from '@/lib/copy/api';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return copyHandler(req);
}
