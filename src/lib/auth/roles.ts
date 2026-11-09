/**
 * The role catalog — the six accounts levels the console ships with, as data.
 *
 * Kept declarative so the seeder, the console's role editor and the permission
 * tests all read one source, and a permissions change shows up as a diff instead
 * of somebody editing SQL by hand.
 *
 * `syncRoles()` is idempotent and it prunes rows this catalog no longer lists.
 * Leaving a stale `user.delete` grant in `role_permissions` after removing it
 * from the catalog would be a live security hole, and `role_permissions` is
 * configuration rather than user content — the never-delete rule of this build
 * covers revisions, snapshots and articles, not grant rows.
 *
 * Scoping rule worth knowing before adding a row: `can()` requires a request to
 * *name* every dimension a scope mentions, so a scope of `{locales:['ar']}`
 * denies a caller that leaves `target.locales` undefined. That is fine on a
 * write, where the body always carries the locale, and wrong on a read — a list
 * endpoint spanning both languages would 403 for the wrong reason. So reads are
 * unscoped here and per-language filtering is the endpoint's own query; the
 * `locales`, `lists`, `pages` and `leadSources` dimensions are exercised on
 * writes, and by `tests/auth.test.ts`.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { json } from '../db/json';
import type { PermissionScope } from '../db/types';
import type { Action, Resource } from './permissions';

/** Every account level in the console. */
export type RoleName = 'Owner' | 'Admin' | 'Editor' | 'SEO' | 'Marketer' | 'Viewer';

/**
 * The lists the site actually renders; BK-6 seeds `lists.list_key` from this.
 *
 * `treatments` left this catalog when the site's /services page stopped being a
 * treatments page: the data moved into `services` and the old rows stay in the
 * database (never deleted) but no role is granted a screen for them.
 */
export const LIST_KEYS = ['nav', 'branches', 'specialists', 'services', 'faq', 'results', 'testimonials'] as const;
/** An editor may rewrite any list except the navigation, which is Admin's. */
export const EDITOR_LIST_KEYS = LIST_KEYS.filter((key) => key !== 'nav');

/** Locales of the site. A role scoped to one of these is a single-language editor. */
export const SITE_LOCALES = ['ar', 'en'] as const;

const WRITE = ['create', 'update', 'delete'] as const;
/** Resources with a draft → published lifecycle also take `publish`. */
const PUBLISHABLE = [...WRITE, 'publish'] as const;

export interface GrantSeed {
  resource: Resource | '*';
  actions: readonly (Action | '*')[];
  scope?: PermissionScope | null;
}

export interface RoleSeed {
  name: RoleName;
  description: string;
  isOwner?: boolean;
  grants: GrantSeed[];
}

export const ROLE_SEEDS: readonly RoleSeed[] = [
  {
    name: 'Owner',
    description: 'Everything, including other accounts and roles. Kept for the clinic owner.',
    isOwner: true,
    grants: [{ resource: '*', actions: ['*'], scope: null }],
  },
  {
    name: 'Admin',
    description: 'Runs the site and the marketing pipeline. Cannot create accounts or edit roles.',
    grants: [
      { resource: '*', actions: ['read'], scope: null },
      { resource: 'article', actions: PUBLISHABLE, scope: null },
      { resource: 'offer', actions: PUBLISHABLE, scope: null },
      { resource: 'page', actions: PUBLISHABLE, scope: null },
      { resource: 'list', actions: PUBLISHABLE, scope: null },
      { resource: 'media', actions: WRITE, scope: null },
      { resource: 'seo', actions: [...WRITE, 'publish'], scope: null },
      { resource: 'redirect', actions: [...WRITE, 'publish'], scope: null },
      { resource: 'cta', actions: [...WRITE, 'publish'], scope: null },
      { resource: 'lead', actions: [...WRITE, 'export'], scope: null },
      // Reads come from the `*` row above; this one is the statistics download.
      { resource: 'stat', actions: ['export'], scope: null },
      { resource: 'setting', actions: ['update'], scope: null },
      { resource: 'integration', actions: ['update'], scope: null },
      { resource: 'audit', actions: ['export'], scope: null },
      { resource: 'permission_request', actions: ['update'], scope: null },
    ],
  },
  {
    name: 'Editor',
    description: 'Writes and publishes content. Publishes both languages, never the navigation.',
    grants: [
      // Reads unscoped, writes narrowed — see the scoping rule at the top.
      { resource: 'article', actions: ['read'], scope: null },
      { resource: 'offer', actions: ['read'], scope: null },
      { resource: 'page', actions: ['read'], scope: null },
      { resource: 'list', actions: ['read'], scope: null },
      { resource: 'article', actions: PUBLISHABLE, scope: { locales: [...SITE_LOCALES] } },
      { resource: 'offer', actions: PUBLISHABLE, scope: { locales: [...SITE_LOCALES] } },
      { resource: 'page', actions: ['create', 'update', 'publish'], scope: { locales: [...SITE_LOCALES] } },
      { resource: 'list', actions: PUBLISHABLE, scope: { lists: [...EDITOR_LIST_KEYS] } },
      { resource: 'media', actions: ['create', 'update'], scope: null },
      { resource: 'seo', actions: ['read'], scope: null },
      { resource: 'lead', actions: ['read'], scope: null },
      { resource: 'stat', actions: ['read'], scope: null },
    ],
  },
  {
    name: 'SEO',
    description: 'Meta, redirects, sitemaps, and read access to what they optimise.',
    grants: [
      // The role's own screen: writing a meta row without being able to read the list
      // would open an empty console, so `read` is spelled out beside the writes.
      { resource: 'seo', actions: ['read', ...WRITE, 'publish'], scope: null },
      { resource: 'redirect', actions: ['read', ...WRITE, 'publish'], scope: null },
      { resource: 'article', actions: ['read'], scope: null },
      { resource: 'offer', actions: ['read'], scope: null },
      { resource: 'page', actions: ['read'], scope: null },
      { resource: 'list', actions: ['read'], scope: null },
      { resource: 'media', actions: ['read'], scope: null },
      { resource: 'stat', actions: ['read'], scope: null },
    ],
  },
  {
    name: 'Marketer',
    description: 'Leads, CTAs and statistics, with contact details. Writes no content.',
    grants: [
      // `read` is spelled out beside WRITE: a worker who may move a lead but may not open
      // the leads screen has a grant it can never exercise.
      { resource: 'lead', actions: ['read', ...WRITE, 'export'], scope: null },
      { resource: 'cta', actions: [...WRITE, 'publish'], scope: null },
      { resource: 'media', actions: ['create', 'update'], scope: null },
      { resource: 'article', actions: ['read'], scope: null },
      { resource: 'offer', actions: ['read'], scope: null },
      { resource: 'page', actions: ['read'], scope: null },
      { resource: 'seo', actions: ['read'], scope: null },
      { resource: 'redirect', actions: ['read'], scope: null },
      { resource: 'stat', actions: ['read', 'export'], scope: null },
      // The marketing screen is this role's home: the tags and the sheet connector.
      // Deliberately no `audit.read`: the log covers every resource, and this role is
      // not an auditor. Who changed the tags is answered on the tracking screen itself
      // from the integration rows, under `integration.read`.
      { resource: 'integration', actions: ['read', 'update'], scope: null },
    ],
  },
  {
    name: 'Viewer',
    description: 'Reports only: reads the site content and lead counts, but never a phone number or address.',
    grants: [
      { resource: 'article', actions: ['read'], scope: null },
      { resource: 'offer', actions: ['read'], scope: null },
      { resource: 'page', actions: ['read'], scope: null },
      { resource: 'list', actions: ['read'], scope: null },
      { resource: 'seo', actions: ['read'], scope: null },
      { resource: 'cta', actions: ['read'], scope: null },
      { resource: 'stat', actions: ['read'], scope: null },
      // Read-only leads are exactly what the redaction rule in ./redaction.ts
      // exists for: this row is how marketing gets a count without the clinic's
      // client list leaking.
      { resource: 'lead', actions: ['read'], scope: null },
    ],
  },
];

export const ROLE_NAMES: readonly RoleName[] = ROLE_SEEDS.map((role) => role.name);

/** One `{resource, action}` pair per row, because `role_permissions` is unique on that pair. */
export interface PermissionRow {
  resource: string;
  action: string;
  scope: PermissionScope | null;
}

export function permissionsFor(role: RoleSeed): PermissionRow[] {
  return role.grants.flatMap((grant) =>
    grant.actions.map((action) => ({ resource: grant.resource, action, scope: grant.scope ?? null })),
  );
}

function scopeKey(scope: PermissionScope | null): string {
  if (scope === null) return 'null';
  // Sorted keys, so a catalog edit that only reorders fields is not a change.
  const entries = Object.keys(scope)
    .sort()
    .map((key) => `${key}:${JSON.stringify((scope as Record<string, unknown>)[key] ?? null)}`);
  return `{${entries.join(',')}}`;
}

export interface RoleSyncRow {
  name: RoleName;
  existed: boolean;
  added: number;
  changed: number;
  removed: number;
  /** Grants in the catalog, whatever the database currently holds. */
  wanted: number;
}

export interface RoleSyncReport {
  database: string;
  dryRun: boolean;
  rows: RoleSyncRow[];
}

/**
 * Make the database match `ROLE_SEEDS` — create the roles, add and repair
 * grants, drop grants the catalog no longer wants. Dry-run by default, like
 * every mutating command in this build.
 */
export async function syncRoles(
  options: { dryRun?: boolean; database: string }
): Promise<RoleSyncReport> {
  const dryRun = options.dryRun ?? true;
  const rows: RoleSyncRow[] = [];

  for (const role of ROLE_SEEDS) {
    const wanted = permissionsFor(role);
    const existing = await db.selectFrom('roles').select(['id']).where('name', '=', role.name).executeTakeFirst();
    const roleId = existing?.id ?? randomUUID();

    let added = 0;
    let changed = 0;
    let removed = 0;

    if (existing) {
      const current = await db
        .selectFrom('role_permissions')
        .select(['id', 'resource', 'action', 'scope'])
        .where('role_id', '=', roleId)
        .execute();
      const currentByKey = new Map(current.map((row) => [`${row.resource}\u0000${row.action}`, row]));
      const wantedKeys = new Set(wanted.map((row) => `${row.resource}\u0000${row.action}`));

      for (const row of wanted) {
        const found = currentByKey.get(`${row.resource}\u0000${row.action}`);
        if (!found) added += 1;
        else if (scopeKey(found.scope ?? null) !== scopeKey(row.scope)) changed += 1;
      }
      removed = current.filter((row) => !wantedKeys.has(`${row.resource}\u0000${row.action}`)).length;

      if (!dryRun) {
        for (const row of current) {
          if (!wantedKeys.has(`${row.resource}\u0000${row.action}`)) {
            await db.deleteFrom('role_permissions').where('id', '=', row.id).execute();
          }
        }
        for (const row of wanted) {
          const found = currentByKey.get(`${row.resource}\u0000${row.action}`);
          if (!found) {
            await db
              .insertInto('role_permissions')
              .values({ id: randomUUID(), role_id: roleId, resource: row.resource, action: row.action, scope: json(row.scope) })
              .execute();
          } else if (scopeKey(found.scope ?? null) !== scopeKey(row.scope)) {
            await db
              .updateTable('role_permissions')
              .set({ scope: json(row.scope) })
              .where('id', '=', found.id)
              .execute();
          }
        }
      }
    } else {
      added = wanted.length;
      if (!dryRun) {
        await db
          .insertInto('roles')
          .values({
            id: roleId,
            name: role.name,
            description: role.description,
            is_system: 1,
            is_owner: role.isOwner ? 1 : 0,
          })
          .execute();
        for (const row of wanted) {
          await db
            .insertInto('role_permissions')
            .values({ id: randomUUID(), role_id: roleId, resource: row.resource, action: row.action, scope: json(row.scope) })
            .execute();
        }
      }
    }

    rows.push({ name: role.name, existed: Boolean(existing), added, changed, removed, wanted: wanted.length });
  }

  return { database: options.database, dryRun, rows };
}
