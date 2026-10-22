import { NextResponse } from 'next/server';
import { SiteDashEngine } from '@/lib/sitedash/engine';

export async function GET() {
  try {
    const [pages, seo, roles] = await Promise.all([
      SiteDashEngine.getPages(),
      SiteDashEngine.getSeo(),
      SiteDashEngine.getRoles(),
    ]);

    return NextResponse.json({
      ok: true,
      data: { pages, seo, roles },
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    switch (action) {
      case 'updateSeo':
        await SiteDashEngine.updateSeo(payload);
        break;
      case 'toggleSection':
        await SiteDashEngine.toggleSection(payload.id, payload.enabled);
        break;
      default:
        return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
