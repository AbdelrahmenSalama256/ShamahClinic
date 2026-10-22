/**
 * The audit trail. Every mutation the console makes lands here, or the operator
 * is told in the response that it did not.
 *
 * A row cannot be written after the fact without the request it belongs to, so
 * this is called from the enforcement path in ./guard.ts rather than from the
 * handlers themselves — a route that forgets is a route that cannot exist.
 */
import { db } from '../db';
import { json } from '../db/json';

export type ActorKind = 'user' | 'cli' | 'system';

export interface AuditRecord {
  actorId: string | null;
  actorEmail: string;
  actorKind: ActorKind;
  /** `article.update`, `session.login`, `owner.reset` — resource.action, 64 characters. */
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipHash?: string;
  requestId?: string;
}

export type AuditOutcome = 'ok' | 'failed';

export async function writeAudit(record: AuditRecord): Promise<AuditOutcome> {
  try {
    await db
      .insertInto('audit_log')
      .values({
        actor_id: record.actorId,
        actor_email: record.actorEmail.slice(0, 255),
        actor_kind: record.actorKind,
        action: record.action.slice(0, 64),
        entity_type: (record.entityType ?? '').slice(0, 32),
        entity_id: (record.entityId ?? '').slice(0, 191),
        before_json: json(record.before ?? null),
        after_json: json(record.after ?? null),
        ip_hash: record.ipHash ?? '',
        request_id: record.requestId ?? '',
      })
      .execute();
    return 'ok';
  } catch (error) {
    // Loud, but the mutation already happened: telling the client "500" would
    // invite a retry that applies the change twice.
    console.error(
      `[audit] failed to record ${record.action} for ${record.entityType ?? '-'} ${record.entityId ?? '-'} (request ${record.requestId ?? '-'})`,
      error instanceof Error ? error.message : error,
    );
    return 'failed';
  }
}
