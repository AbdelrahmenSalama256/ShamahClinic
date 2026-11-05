import { leadExportHandler } from '@/lib/leads/api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return leadExportHandler(req);
}
