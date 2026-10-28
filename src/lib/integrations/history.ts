/**
 * The marketing change history, read from the audit trail, and the one way back.
 *
 * Every write through `guard()` leaves an `audit_log` row; this module selects the
 * integration rows and nothing else, so the screen that shows them needs no grant beyond
 * `integration.read`. The trail is append-only: a revert writes the earlier value as a
 * new save, which the guard then audits like any other, and never deletes the row it
 * restores from.
 *
 * Only the tag document can be rewound. A sheet change is audited as the masked URL and
 * whether a token is set — never the URL itself and never the token — so there is nothing
 * in the log that could put a working connector back. Those rows are shown and marked.
 */
import { db } from '../db';
import { writeSetting } from '../content/settings';
import { normalizeConfig, type TrackingConfig } from '../tracking/providers';
import { readTrackingConfig, TRACKING_GROUP, TRACKING_KEY } from '../tracking/server';

export const HISTORY_LIMIT = 30;

/** The entity ids this screen knows how to describe. Anything else is still shown, unnamed. */
export const HISTORY_TARGETS = [
  'tracking.providers',
  'sheets',
  'sheets.test',
  'sheets.resend',
  'sheets.drain',
] as const;
export type HistoryTarget = (typeof HISTORY_TARGETS)[number];

export interface IntegrationHistoryRow {
  id: number;
  at: string;
  actorEmail: string;
  action: string;
  entityId: string;
  before: unknown;
  after: unknown;
  /** Only the tag document can be restored: see the module comment. */
  revertable: boolean;
}

function decode(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

/**
 * Newest first. Rows a POST with no audit patch leaves behind — "check installation"
 * and a bare drain — carry no entity id; they changed no setting, so they are not part
 * of this history.
 */
export async function integrationHistory(limit = HISTORY_LIMIT): Promise<IntegrationHistoryRow[]> {
  const rows = await db
    .selectFrom('audit_log')
    .select(['id', 'actor_email', 'action', 'entity_id', 'before_json', 'after_json', 'created_at'])
    .where('entity_type', '=', 'integration')
    .where('entity_id', 'in', [...HISTORY_TARGETS])
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(Math.max(1, Math.min(100, limit)))
    .execute();

  return rows.map((row) => ({
    id: Number(row.id),
    at: iso(row.created_at),
    actorEmail: row.actor_email,
    action: row.action,
    entityId: row.entity_id,
    before: decode(row.before_json),
    after: decode(row.after_json),
    revertable: row.entity_id === 'tracking.providers',
  }));
}

export type RevertResult =
  | { ok: true; config: TrackingConfig; previous: TrackingConfig }
  | { ok: false; status: number; code: string };

/**
 * Put the tag document back to the value a history row recorded before its change.
 *
 * The row is named by id and must still be an `integration` row for the tag document;
 * the sheet rows are refused rather than guessed at. The write goes through the same
 * `writeSetting` path the screen uses, so the reverted state is read back exactly as it
 * would be after a save.
 */
export async function revertIntegration(id: number, actorId: string): Promise<RevertResult> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, code: 'invalid_input' };

  const row = await db
    .selectFrom('audit_log')
    .select(['entity_type', 'entity_id', 'before_json'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row || row.entity_type !== 'integration') return { ok: false, status: 404, code: 'not_found' };
  if (row.entity_id !== 'tracking.providers') return { ok: false, status: 422, code: 'not_revertable' };

  const restored = decode(row.before_json);
  if (restored === null || typeof restored !== 'object') return { ok: false, status: 422, code: 'no_before' };

  const previous = await readTrackingConfig();
  const next = normalizeConfig(restored);
  const saved = await writeSetting({ group: TRACKING_GROUP, key: TRACKING_KEY, value: next, actorId });
  if (!saved.ok) return { ok: false, status: saved.status, code: saved.code };
  return { ok: true, config: next, previous };
}
