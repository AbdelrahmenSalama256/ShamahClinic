import { overviewExportHandler } from '@/lib/console/overview-api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return overviewExportHandler(req);
}
