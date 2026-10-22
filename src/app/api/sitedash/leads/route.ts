import { NextResponse } from 'next/server';
import { SiteDashEngine } from '@/lib/sitedash/engine';

export async function GET() {
  try {
    const leads = await SiteDashEngine.getLeads();
    return NextResponse.json({ ok: true, data: leads });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    await SiteDashEngine.addLead(body);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
