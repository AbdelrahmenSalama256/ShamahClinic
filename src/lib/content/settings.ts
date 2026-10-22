/**
 * The site's settings, as the console sees them: `settings` is a JSON value per
 * `(group_name, setting_key)`, with no draft/published pair — a setting takes
 * effect when it is saved.
 *
 * A row flagged `is_secret` is read-only here and its value never leaves this
 * module: an admin console must not be a place where a token is displayed to
 * whoever is looking over the operator's shoulder. Secrets belong in the
 * environment, which is what `.env.example` documents.
 */
import { db } from '../db';
import type { StoreResult } from './store';

export interface SettingView {
  group: string;
  key: string;
  value: unknown;
  defaultValue: unknown;
  secret: boolean;
  version: number;
  updatedAt: string;
}

function toView(row: {
  group_name: string;
  setting_key: string;
  value: unknown;
  default_value: unknown;
  is_secret: number;
  version: number;
  updated_at: Date;
}): SettingView {
  const secret = Number(row.is_secret) === 1;
  return {
    group: row.group_name,
    key: row.setting_key,
    value: secret ? null : parse(row.value),
    defaultValue: secret ? null : parse(row.default_value),
    secret,
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** MariaDB prints JSON as LONGTEXT; the driver parses most of it, but not every path. */
function parse(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function readSettings(): Promise<SettingView[]> {
  const rows = await db.selectFrom('settings').selectAll().orderBy('group_name', 'asc').orderBy('setting_key', 'asc').execute();
  return rows.map(toView);
}

export async function writeSetting(input: {
  group: string;
  key: string;
  value: unknown;
  actorId: string;
}): Promise<StoreResult<SettingView>> {
  const existing = await db
    .selectFrom('settings')
    .select(['is_secret', 'version'])
    .where('group_name', '=', input.group)
    .where('setting_key', '=', input.key)
    .executeTakeFirst();

  if (existing && Number(existing.is_secret) === 1) return { ok: false, status: 403, code: 'secret_setting' };

  const encoded = JSON.stringify(input.value ?? null);
  if (existing) {
    await db
      .updateTable('settings')
      .set({ value: encoded, updated_by: input.actorId, version: Number(existing.version) + 1 })
      .where('group_name', '=', input.group)
      .where('setting_key', '=', input.key)
      .execute();
  } else {
    await db
      .insertInto('settings')
      .values({ group_name: input.group, setting_key: input.key, value: encoded, default_value: encoded, updated_by: input.actorId, version: 1 })
      .execute();
  }

  const row = await db
    .selectFrom('settings')
    .selectAll()
    .where('group_name', '=', input.group)
    .where('setting_key', '=', input.key)
    .executeTakeFirst();
  if (!row) return { ok: false, status: 500, code: 'write_failed' };
  return { ok: true, value: toView(row) };
}
