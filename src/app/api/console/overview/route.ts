import { overviewHandler } from '@/lib/console/overview-api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return overviewHandler(req);
}
