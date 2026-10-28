/**
 * The console half of marketing: the tag plan, the sheet connector, and the delivery
 * operations. One resource (`integration`) covers both, so a Marketer who may edit the
 * tags may also point the sheet at their own spreadsheet, and neither is reachable by
 * someone holding only content grants.
 */
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { writeSetting } from '../content/settings';
import {
  PROVIDER_HOSTS,
  PROVIDER_KEYS,
  TRACKING_PROVIDERS,
  planTags,
  providerByKey,
  validateId,
  type TrackingConfig,
} from '../tracking/providers';
import { readTrackingConfig, TRACKING_GROUP, TRACKING_KEY } from '../tracking/server';
import {
  maskUrl,
  normalizeSheetsConfig,
  validateSheetsUrl,
  validateToken,
  type SheetsConfig,
} from './sheets';
import {
  drainOutbox,
  readSheetsIntegration,
  resendFailed,
  saveSheetsIntegration,
  sendTestRow,
} from './delivery';
import { SHEETS_TEST_GROUP, SHEETS_TEST_KEY, sheetsView } from './view';
import { integrationHistory, revertIntegration } from './history';

function revalidateSite(): void {
  try {
    revalidatePath('/[lang]', 'layout');
  } catch {
    /* outside a request (direct handler calls in tests) there is no cache to clear */
  }
}

/** One row the owner edits: the ID, and whether it is on. */
const providerRowSchema = z.object({
  id: z.string().max(120),
  label: z.string().max(80).optional(),
  enabled: z.boolean(),
});

const trackingSchema = z.object({ providers: z.record(z.string(), providerRowSchema) });

const checkSchema = z.object({
  action: z.literal('check'),
  provider: z.string().max(40),
  lang: z.enum(['ar', 'en']).optional(),
});

const revertSchema = z.object({
  action: z.literal('revert'),
  id: z.number().int().positive(),
});

const trackingActionSchema = z.discriminatedUnion('action', [checkSchema, revertSchema]);

/**
 * Reads a page from the running site for the installation check. Passed in by the route
 * file: `src/lib` makes no network calls at all (proof: `tests/no-wp-network.test.ts`),
 * and asking our own origin what it serves is the handler's only outbound request.
 */
export type PublicPageReader = (url: string) => Promise<string | null>;

/** `GET|PATCH|POST /api/console/tracking` */
export async function trackingHandler(req: Request, readPage?: PublicPageReader): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'integration', action: 'read' }, async () => {
      const [config, history] = await Promise.all([readTrackingConfig(), integrationHistory()]);
      return {
        data: {
          config,
          plan: planTags(config),
          history,
          catalog: TRACKING_PROVIDERS.map((provider) => ({
            key: provider.key,
            category: provider.category,
            label: provider.label,
            hint: provider.hint,
            placeholder: provider.placeholder,
            example: provider.example,
            hasLabel: provider.hasLabel === true,
            insideGtm: provider.insideGtm === true,
          })),
          hosts: PROVIDER_HOSTS,
        },
      };
    });
  }
  if (req.method === 'POST') {
    return guard<z.output<typeof trackingActionSchema>, unknown>(
      req,
      { resource: 'integration', action: 'update', schema: trackingActionSchema },
      async (ctx): Promise<GuardResult<unknown>> => {
        if (ctx.input.action === 'revert') {
          const outcome = await revertIntegration(ctx.input.id, ctx.auth.user.id);
          if (!outcome.ok) return { status: outcome.status, data: { error: outcome.code } };
          revalidateSite();
          return {
            data: { config: outcome.config, plan: planTags(outcome.config) },
            audit: {
              entityType: 'integration',
              entityId: 'tracking.providers',
              before: outcome.previous,
              after: outcome.config,
            },
          };
        }

        const provider = providerByKey(ctx.input.provider);
        if (!provider) return { status: 400, data: { error: 'unknown_provider' } };

        const config = await readTrackingConfig();
        const plan = planTags(config);
        const row = config[provider.key];
        const verdict = row ? validateId(provider, row.id, row.label) : null;
        let state: 'empty' | 'invalid' | 'off' | 'suppressed' | 'on';
        if (!row || row.id === '') state = 'empty';
        else if (!verdict?.ok) state = 'invalid';
        else if (!row.enabled) state = 'off';
        else if (plan.suppressed.includes(provider.key)) state = 'suppressed';
        else state = 'on';

        // The tag plan reaches the browser as part of the page, so the ID appearing in the
        // public HTML is the one thing a server can verify. Whether a vendor recorded a
        // visit needs a cookie-accepting browser and the vendor's own dashboard.
        let inPage: boolean | null = null;
        if (state === 'on' && verdict?.ok && readPage) {
          try {
            const html = await readPage(`${new URL(req.url).origin}/${ctx.input.lang ?? 'ar'}`);
            if (html !== null) inPage = html.includes(verdict.value);
          } catch {
            inPage = null;
          }
        }

        return {
          data: {
            provider: provider.key,
            state,
            id: row?.id ?? '',
            inPage,
            checkedAt: new Date().toISOString(),
          },
        };
      },
    );
  }

  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof trackingSchema>, unknown>(
    req,
    { resource: 'integration', action: 'update', schema: trackingSchema },
    async (ctx): Promise<GuardResult<unknown>> => {
      const before = await readTrackingConfig();
      const next: TrackingConfig = {};

      for (const key of PROVIDER_KEYS) {
        const row = ctx.input.providers[key];
        if (!row) continue;
        const id = row.id.trim();
        if (id === '') continue;
        const provider = providerByKey(key);
        if (!provider) continue;
        const verdict = validateId(provider, id, row.label);
        if (!verdict.ok) {
          // Refused before anything is written: a half-saved set of tags is a page that
          // loads some vendors and not others, which is harder to notice than a refusal.
          return {
            status: 422,
            data: { error: 'invalid_id', provider: key, reason: verdict.reason },
          };
        }
        next[key] = { id: verdict.value, ...(row.label?.trim() ? { label: row.label.trim() } : {}), enabled: row.enabled };
      }

      const saved = await writeSetting({
        group: TRACKING_GROUP,
        key: TRACKING_KEY,
        value: next,
        actorId: ctx.auth.user.id,
      });
      if (!saved.ok) return { status: saved.status, data: { error: saved.code } };
      revalidateSite();

      return {
        data: { config: next, plan: planTags(next) },
        audit: { entityType: 'integration', entityId: 'tracking.providers', before, after: next },
      };
    },
  );
}

const sheetsSchema = z.object({
  url: z.string().max(500),
  token: z.string().max(80).optional(),
  enabled: z.boolean(),
});

const sheetsActionSchema = z.object({ action: z.enum(['test', 'drain', 'resend']) });

/** `GET|PATCH|POST /api/console/sheets` */
export async function sheetsHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'integration', action: 'read' }, async () => ({ data: await sheetsView() }));
  }

  if (req.method === 'PATCH') {
    return guard<z.output<typeof sheetsSchema>, unknown>(
      req,
      { resource: 'integration', action: 'update', schema: sheetsSchema },
      async (ctx): Promise<GuardResult<unknown>> => {
        const before = await readSheetsIntegration();
        const previous = normalizeSheetsConfig(before?.config);
        // A blank URL field keeps the saved one, so switching the connector off does not
        // require retyping an address the console only knows in masked form.
        const url = ctx.input.url.trim() || previous.url;
        const verdict = validateSheetsUrl(url);
        if (!verdict.ok) {
          return { status: 422, data: { error: 'invalid_url', reason: verdict.reason } };
        }
        if (ctx.input.token !== undefined && ctx.input.token !== '' && !validateToken(ctx.input.token)) {
          return { status: 422, data: { error: 'invalid_token' } };
        }
        // An omitted token keeps the saved one; an empty string clears it.
        const token = ctx.input.token === undefined ? previous.token : ctx.input.token;
        const config: SheetsConfig = { url: verdict.value, token, enabled: ctx.input.enabled };

        await saveSheetsIntegration({ config, enabled: config.enabled, actorId: ctx.auth.user.id });
        const view = await sheetsView();
        return {
          data: view,
          audit: {
            entityType: 'integration',
            entityId: 'sheets',
            before: { maskedUrl: previous.url ? maskUrl(previous.url) : '', tokenSet: previous.token !== '', enabled: before?.enabled === true },
            after: { maskedUrl: maskUrl(config.url), tokenSet: config.token !== '', enabled: config.enabled },
          },
        };
      },
    );
  }

  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof sheetsActionSchema>, unknown>(
    req,
    { resource: 'integration', action: 'update', schema: sheetsActionSchema },
    async (ctx): Promise<GuardResult<unknown>> => {
      if (ctx.input.action === 'test') {
        const result = await sendTestRow();
        await writeSetting({
          group: SHEETS_TEST_GROUP,
          key: SHEETS_TEST_KEY,
          value: { at: new Date().toISOString(), ok: result.ok, status: result.status, error: result.error },
          actorId: ctx.auth.user.id,
        });
        return { data: { result, ...(await sheetsView()) }, audit: { entityType: 'integration', entityId: 'sheets.test', after: result } };
      }
      if (ctx.input.action === 'resend') {
        const queued = await resendFailed();
        const result = await drainOutbox(20);
        return { data: { queued, result, ...(await sheetsView()) }, audit: { entityType: 'integration', entityId: 'sheets.resend', after: { queued, ...result } } };
      }
      const result = await drainOutbox(20);
      return {
        data: { result, ...(await sheetsView()) },
        audit: { entityType: 'integration', entityId: 'sheets.drain', after: result },
      };
    },
  );
}
