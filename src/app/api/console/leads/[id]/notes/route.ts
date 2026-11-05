import { leadsHandler } from '@/lib/leads/api';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return leadsHandler(req);
}
