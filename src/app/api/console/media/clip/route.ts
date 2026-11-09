import { z } from 'zod';
import { guard, type GuardResult } from '@/lib/auth/guard';
import { putClip } from '@/lib/media/clip';

export const runtime = 'nodejs';

type Body = Record<string, unknown>;

const clipSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(['audio', 'video']),
  bytes: z.instanceof(Uint8Array),
});

/** Read after `guard()` authenticated the caller, exactly like the picture upload. */
async function multipart(req: Request): Promise<unknown> {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return {};
    return {
      filename: file.name || 'clip',
      kind: form.get('kind'),
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
  } catch {
    return {};
  }
}

/** `POST /api/console/media/clip` — a voice note or a video, one file per request. */
export async function POST(req: Request): Promise<Response> {
  return guard<z.output<typeof clipSchema>, Body>(
    req,
    { resource: 'media', action: 'create', schema: clipSchema, inputFrom: multipart },
    async (ctx): Promise<GuardResult<Body>> => {
      const stored = await putClip({ ...ctx.input, actorId: ctx.auth.user.id });
      if (!stored.ok) return { status: stored.status, data: { error: stored.code } };
      return {
        data: { media: stored.value },
        audit: { entityType: 'media', entityId: stored.value.id, after: { path: stored.value.src, bytes: stored.value.bytes } },
      };
    },
  );
}
