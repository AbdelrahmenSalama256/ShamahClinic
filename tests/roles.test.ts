/**
 * BK-4 roles, against the disposable `shamah_cms_test` database.
 *
 * Three things get proven here: that the catalog seeds the database and stays
 * matched to it (idempotent, and it prunes a grant nobody asked for any more),
 * that each of the six levels means what its description says, and that a
 * caller without a grant is answered 403 for **every** resource and write
 * action — never 400, which would confirm the endpoint exists and what it
 * wanted in the body.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { ACTIONS, RESOURCES, can, type Action, type Grant, type Resource } from '../src/lib/auth/permissions';
import { CSRF_HEADER } from '../src/lib/auth/env';
import { LIST_KEYS, ROLE_SEEDS, permissionsFor, syncRoles, type RoleName, type RoleSyncReport } from '../src/lib/auth/roles';
import { hiddenLeadContactFields, redactLead, type LeadLike } from '../src/lib/auth/redaction';
import { guard } from '../src/lib/auth/guard';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser } from '../src/lib/auth/users';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-roles-2026';
const UNSAFE_ACTIONS: Action[] = ['create', 'update', 'delete', 'publish', 'export'];

const emails: Record<RoleName, string> = {
  Owner: `bk4-owner-${run}@example.invalid`,
  Admin: `bk4-admin-${run}@example.invalid`,
  Editor: `bk4-editor-${run}@example.invalid`,
  SEO: `bk4-seo-${run}@example.invalid`,
  Marketer: `bk4-marketer-${run}@example.invalid`,
  Viewer: `bk4-viewer-${run}@example.invalid`,
};

const userIds: string[] = [];
/** role name → { grants from the database, session token, csrf token }. */
const actors = {} as Record<RoleName, { grants: Grant[]; token: string; csrf: string }>;

interface SyncReports {
  dry: RoleSyncReport;
  apply: RoleSyncReport;
  again: RoleSyncReport;
  grantsBeforeDry: number;
  grantsAfterDry: number;
}
let reports!: SyncReports;

const sampleLead: LeadLike & { id: string } = {
  id: `bk4-lead-${run}`,
  source: 'contact-form',
  name: 'Sara Malik',
  phone: '+966 55 000 0000',
  email: 'sara@example.invalid',
  message: 'Appointment request for a consultation.',
  fields: { service: 'skin' },
};

let ipSeq = 0;
const ip = (): string => `203.0.113.${++ipSeq % 254}`;

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip());
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!line) return '';
  return decodeURIComponent(line.slice(name.length + 1).split(';')[0]);
}

/** The strictest possible schema: one required field, so any empty body is a 400 — if it ever gets read. */
function writeRoute(resource: Resource, action: Action) {
  return (req: Request): Promise<Response> =>
    guard<{ required_field: string }, { saved: string }>(
      req,
      { resource, action, schema: z.object({ required_field: z.string().min(1) }) },
      async ({ input }) => ({ data: { saved: input.required_field }, audit: { entityId: `bk4-${run}` } }),
    );
}

async function grantsOf(userId: string): Promise<Grant[]> {
  return (await loadGrants(userId)).grants;
}

function catalogGrants(name: RoleName): Grant[] {
  const seed = ROLE_SEEDS.find((role) => role.name === name);
  if (!seed) throw new Error(`No catalog entry for ${name}`);
  return permissionsFor(seed);
}

beforeAll(async () => {
  assertTestDb();
  const { database } = readDbConfig();

  const grantCount = async (): Promise<number> => (await db.selectFrom('role_permissions').select('id').execute()).length;
  const grantsBeforeDry = await grantCount();
  const dry = await syncRoles({ dryRun: true, database });
  const grantsAfterDry = await grantCount();
  const apply = await syncRoles({ dryRun: false, database });
  const again = await syncRoles({ dryRun: false, database });
  reports = { dry, apply, again, grantsBeforeDry, grantsAfterDry };

  for (const role of ROLE_SEEDS) {
    const userId = await createUser({ email: emails[role.name], password: PASSWORD, name: `BK4 ${role.name}` });
    const stored = await db.selectFrom('roles').select('id').where('name', '=', role.name).executeTakeFirstOrThrow();
    await assignRole(userId, stored.id);
    userIds.push(userId);

    const res = await loginHandler(request('/auth', { method: 'POST', body: JSON.stringify({ email: emails[role.name], password: PASSWORD }) }));
    const body = (await res.json()) as { csrfToken: string };
    actors[role.name] = { grants: await grantsOf(userId), token: cookieValue(setCookies(res), 'shamah_session'), csrf: body.csrfToken };
  }
});

afterAll(async () => {
  if (userIds.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('audit_log').where('actor_id', 'in', userIds).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', userIds).execute();
    await db
      .deleteFrom('login_attempts')
      .where('email_lc', 'in', Object.values(emails).map((email) => email.toLowerCase()))
      .execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  const seeded = await db.selectFrom('roles').select('id').where('name', 'in', ROLE_SEEDS.map((role) => role.name)).execute();
  if (seeded.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', seeded.map((role) => role.id)).execute();
    await db.deleteFrom('roles').where('id', 'in', seeded.map((role) => role.id)).execute();
  }
  await destroyDb();
});

describe('the role catalog reaches the database', () => {
  it('changes nothing on a dry run, and reports the same counts the write then makes', () => {
    expect(reports.grantsAfterDry).toBe(reports.grantsBeforeDry);
    expect(reports.dry.dryRun).toBe(true);
    expect(reports.apply.dryRun).toBe(false);
    expect(reports.dry.rows).toHaveLength(ROLE_SEEDS.length);
    for (const role of ROLE_SEEDS) {
      const dry = reports.dry.rows.find((row) => row.name === role.name);
      expect(dry?.wanted, role.name).toBe(permissionsFor(role).length);
    }
    expect(reports.apply.rows.map((row) => row.added)).toEqual(reports.dry.rows.map((row) => row.added));
  });

  it('holds all six levels, each with exactly the catalog grants', async () => {
    for (const role of ROLE_SEEDS) {
      const stored = await db
        .selectFrom('role_permissions')
        .innerJoin('roles', 'roles.id', 'role_permissions.role_id')
        .select(['role_permissions.resource', 'role_permissions.action', 'role_permissions.scope'])
        .where('roles.name', '=', role.name)
        .execute();
      const asSet = (rows: Array<{ resource: string; action: string; scope: unknown }>) =>
        rows
          .map((row) => `${row.resource}|${row.action}|${JSON.stringify(row.scope ?? null)}`)
          .sort()
          .join('\n');
      expect(asSet(stored)).toEqual(asSet(permissionsFor(role)));
    }
  });

  it('seeding twice changes nothing', () => {
    for (const row of reports.again.rows) {
      expect(row).toMatchObject({ added: 0, changed: 0, removed: 0 });
    }
  });

  it('drops a grant the catalog no longer lists', async () => {
    const viewer = await db.selectFrom('roles').select('id').where('name', '=', 'Viewer').executeTakeFirstOrThrow();
    await db
      .insertInto('role_permissions')
      .values({ id: randomUUID(), role_id: viewer.id, resource: 'user', action: 'delete', scope: json(null) })
      .execute();

    const report = await syncRoles({ dryRun: false, database: readDbConfig().database });
    expect(report.rows.find((row) => row.name === 'Viewer')?.removed).toBe(1);

    const stale = await db
      .selectFrom('role_permissions')
      .select('id')
      .where('role_id', '=', viewer.id)
      .where('resource', '=', 'user')
      .execute();
    expect(stale).toHaveLength(0);
  });

  it('keeps the Owner role the one that can never be locked out', async () => {
    const owner = await db.selectFrom('roles').select(['is_owner', 'is_system']).where('name', '=', 'Owner').executeTakeFirstOrThrow();
    expect(owner).toEqual({ is_owner: 1, is_system: 1 });
    expect(actors.Owner.grants.some((grant) => grant.resource === '*' && grant.action === '*')).toBe(true);
  });

  it('gives every signed-in account the self grant without storing it', async () => {
    expect(can(actors.Viewer.grants, 'self', 'update')).toBe(true);
    expect(can([], 'self', 'read')).toBe(true);
    const stored = await db
      .selectFrom('role_permissions')
      .select('id')
      .where('resource', '=', 'self')
      .execute();
    expect(stored).toHaveLength(0);
  });
});

describe('what each level can do', () => {
  interface Case {
    role: RoleName;
    resource: Resource;
    action: Action;
    target?: Record<string, string>;
    allowed: boolean;
    why: string;
  }

  const cases: Case[] = [
    { role: 'Owner', resource: 'role', action: 'update', allowed: true, why: 'only the Owner edits roles' },
    { role: 'Owner', resource: 'user', action: 'create', allowed: true, why: 'only the Owner makes accounts' },

    { role: 'Admin', resource: 'user', action: 'create', allowed: false, why: 'accounts stay with the Owner' },
    { role: 'Admin', resource: 'user', action: 'update', allowed: false, why: 'so an Admin cannot set a password and become the Owner' },
    { role: 'Admin', resource: 'role', action: 'update', allowed: false, why: 'an Admin must not widen their own role' },
    { role: 'Admin', resource: 'user', action: 'read', allowed: true, why: 'but they see who has an account' },
    { role: 'Admin', resource: 'setting', action: 'update', allowed: true, why: 'site configuration' },
    { role: 'Admin', resource: 'page', action: 'delete', allowed: true, why: 'full content control' },
    { role: 'Admin', resource: 'lead', action: 'export', allowed: true, why: 'CSV of leads' },
    { role: 'Admin', resource: 'audit', action: 'export', allowed: true, why: 'audit export' },

    { role: 'Editor', resource: 'article', action: 'update', target: { locales: 'ar' }, allowed: true, why: 'publishes Arabic' },
    { role: 'Editor', resource: 'article', action: 'update', target: { locales: 'en' }, allowed: true, why: 'publishes English too' },
    { role: 'Editor', resource: 'article', action: 'update', allowed: false, why: 'a scoped write must name the locale' },
    { role: 'Editor', resource: 'article', action: 'update', target: { locales: 'de' }, allowed: false, why: 'German is not this site' },
    { role: 'Editor', resource: 'list', action: 'update', target: { lists: 'branches' }, allowed: true, why: 'branch list' },
    { role: 'Editor', resource: 'list', action: 'update', target: { lists: 'nav' }, allowed: false, why: 'navigation is Admin-only' },
    { role: 'Editor', resource: 'page', action: 'delete', allowed: false, why: 'deleting a page is Admin-only' },
    { role: 'Editor', resource: 'lead', action: 'update', allowed: false, why: 'the Editor reads leads, never works them' },
    { role: 'Editor', resource: 'setting', action: 'update', allowed: false, why: 'no site configuration' },
    { role: 'Editor', resource: 'seo', action: 'update', allowed: false, why: 'SEO belongs to the SEO role' },
    { role: 'Editor', resource: 'user', action: 'read', allowed: false, why: 'no account list' },

    { role: 'SEO', resource: 'seo', action: 'read', allowed: true, why: 'opens the screen it writes' },
    { role: 'SEO', resource: 'seo', action: 'publish', allowed: true, why: 'regenerates sitemap and robots' },
    { role: 'SEO', resource: 'redirect', action: 'delete', allowed: true, why: 'owns redirects' },
    { role: 'SEO', resource: 'article', action: 'read', allowed: true, why: 'reads what it optimises' },
    { role: 'SEO', resource: 'article', action: 'update', allowed: false, why: 'does not write content' },
    { role: 'SEO', resource: 'lead', action: 'read', allowed: false, why: 'no leads at all' },
    { role: 'SEO', resource: 'media', action: 'update', allowed: false, why: 'read-only media' },

    { role: 'Marketer', resource: 'lead', action: 'read', allowed: true, why: 'opens the screen it works' },
    { role: 'Marketer', resource: 'lead', action: 'update', allowed: true, why: 'works the pipeline' },
    { role: 'Marketer', resource: 'lead', action: 'export', allowed: true, why: 'CSV and Sheets' },
    { role: 'Marketer', resource: 'cta', action: 'publish', allowed: true, why: 'owns CTAs' },
    { role: 'Marketer', resource: 'article', action: 'update', allowed: false, why: 'writes no content' },
    { role: 'Marketer', resource: 'setting', action: 'update', allowed: false, why: 'no site configuration' },
    { role: 'Marketer', resource: 'audit', action: 'read', allowed: false, why: 'not an auditor' },

    { role: 'Viewer', resource: 'lead', action: 'read', allowed: true, why: 'counts only, fields redacted' },
    { role: 'Viewer', resource: 'lead', action: 'update', allowed: false, why: 'reports, does not work' },
    { role: 'Viewer', resource: 'stat', action: 'read', allowed: true, why: 'the whole point of the role' },
    { role: 'Viewer', resource: 'article', action: 'read', allowed: true, why: 'reads content' },
    { role: 'Viewer', resource: 'article', action: 'update', allowed: false, why: 'read-only everywhere' },
    { role: 'Viewer', resource: 'setting', action: 'read', allowed: false, why: 'configuration is not a report' },
    { role: 'Viewer', resource: 'redirect', action: 'read', allowed: false, why: 'no visibility into redirects' },
    { role: 'Viewer', resource: 'media', action: 'read', allowed: false, why: 'no media library' },
  ];

  for (const testCase of cases) {
    it(`${testCase.role}: ${testCase.resource}.${testCase.action}${testCase.target ? ` ${JSON.stringify(testCase.target)}` : ''} → ${testCase.allowed ? 'allowed' : 'denied'} — ${testCase.why}`, () => {
      expect(can(catalogGrants(testCase.role), testCase.resource, testCase.action, testCase.target ?? {})).toBe(testCase.allowed);
    });
  }

  it('says the same thing from the database as from the catalog', () => {
    for (const role of ROLE_SEEDS) {
      for (const testCase of cases.filter((entry) => entry.role === role.name)) {
        expect(
          can(actors[role.name].grants, testCase.resource, testCase.action, testCase.target ?? {}),
          `${role.name} via ${testCase.resource}.${testCase.action}`,
        ).toBe(testCase.allowed);
      }
    }
  });

  it('only ever grants actions and resources the guard can ask about', () => {
    const knownResources = new Set<string>([...RESOURCES, '*']);
    const knownActions = new Set<string>([...ACTIONS, '*']);
    for (const role of ROLE_SEEDS) {
      for (const permission of permissionsFor(role)) {
        expect(knownResources.has(permission.resource), `${role.name}: ${permission.resource}`).toBe(true);
        expect(knownActions.has(permission.action), `${role.name}: ${permission.action}`).toBe(true);
      }
    }
  });

  it('names the lists the site really has', () => {
    // The nav list is a real file in src/data, so a scope that excluded it is a
    // rule somebody can actually trip over rather than a made-up key.
    expect(LIST_KEYS).toContain('nav');
    expect(LIST_KEYS).toContain('branches');
    expect(readFileSync(join(process.cwd(), 'src/data/nav.ts'), 'utf8')).toContain('export');
  });
});

describe('lead contact fields are redacted by permission', () => {
  it('hides name, phone, email and message from a read-only lead grant', () => {
    for (const role of ['Viewer', 'Editor', 'SEO'] as RoleName[]) {
      const view = redactLead(actors[role].grants, sampleLead);
      expect(view.contact_hidden, role).toBe(true);
      expect({ name: view.name, phone: view.phone, email: view.email, message: view.message }).toEqual({
        name: '',
        phone: '',
        email: '',
        message: null,
      });
      expect(hiddenLeadContactFields(actors[role].grants, sampleLead)).toEqual(['name', 'phone', 'email', 'message', 'fields']);
    }
  });

  it('shows them to anyone who can work or export the lead', () => {
    for (const role of ['Owner', 'Admin', 'Marketer'] as RoleName[]) {
      const view = redactLead(actors[role].grants, sampleLead);
      expect(view.contact_hidden, role).toBe(false);
      expect(view.phone).toBe(sampleLead.phone);
      expect(view.email).toBe(sampleLead.email);
      expect(hiddenLeadContactFields(actors[role].grants, sampleLead)).toEqual([]);
    }
  });

  it('keeps the columns a report needs while blanking who the person is', () => {
    const view = redactLead(actors.Viewer.grants, sampleLead);
    expect(view.id).toBe(sampleLead.id);
    expect(view.source).toBe('contact-form');
  });

  it('does not lose a lead whose source the catalog never heard of', async () => {
    // Marketer's lead grants are unscoped on purpose: a new form on the site
    // must not silently disappear from marketing's inbox.
    const newSource: LeadLike = { source: 'instagram-bio-link', name: 'Nobody', phone: '+966 55 111 1111' };
    expect(redactLead(actors.Marketer.grants, newSource).contact_hidden).toBe(false);
    expect(redactLead(actors.Viewer.grants, newSource).contact_hidden).toBe(true);
  });
});

describe('every write route answers 403, not 400', () => {
  it('denies a Viewer before the body is read, for all 75 resource/action pairs', async () => {
    const viewer = actors.Viewer;
    const seen: string[] = [];
    for (const resource of RESOURCES) {
      if (resource === 'self') continue;
      for (const action of UNSAFE_ACTIONS) {
        const res = await writeRoute(resource, action)(
          request(`/bk4-sweep/${resource}/${action}`, {
            method: 'POST',
            cookie: `shamah_session=${viewer.token}`,
            headers: { [CSRF_HEADER]: viewer.csrf },
            body: '{}',
          }),
        );
        const body = (await res.json()) as { error?: string; action?: string };
        expect(res.status, `${resource}.${action} → ${JSON.stringify(body)}`).toBe(403);
        expect(body.error).toBe('forbidden');
        expect(body.action).toBe(`${resource}.${action}`);
        seen.push(`${resource}.${action}`);
      }
    }
    expect(seen).toHaveLength(RESOURCES.length * UNSAFE_ACTIONS.length - UNSAFE_ACTIONS.length);
  });

  it('proves the sweep measures permissions and not JSON, by 400ing the same body to a role that has the grant', async () => {
    const admin = actors.Admin;
    const res = await writeRoute('setting', 'update')(
      request('/bk4-sweep/setting/update', {
        method: 'POST',
        cookie: `shamah_session=${admin.token}`,
        headers: { [CSRF_HEADER]: admin.csrf },
        body: '{}',
      }),
    );
    const body = (await res.json()) as { error?: string; issues?: unknown[] };
    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_input');
    expect(body.issues?.length).toBeGreaterThan(0);
  });

  it('lets the one implicit grant through to validation', async () => {
    const viewer = actors.Viewer;
    const res = await writeRoute('self', 'update')(
      request('/bk4-sweep/self/update', {
        method: 'POST',
        cookie: `shamah_session=${viewer.token}`,
        headers: { 'x-csrf-token': viewer.csrf },
        body: '{}',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('writes no audit row for a denied attempt', async () => {
    const rows = await db
      .selectFrom('audit_log')
      .select(['id', 'action'])
      .where('actor_email', '=', emails.Viewer)
      .where('action', 'not like', 'session.%')
      .execute();
    expect(rows).toHaveLength(0);
  });

  it('refuses the same route with a valid session but no CSRF header', async () => {
    const viewer = actors.Viewer;
    const res = await writeRoute('setting', 'update')(
      request('/bk4-sweep/setting/update', { method: 'POST', cookie: `shamah_session=${viewer.token}`, body: '{}' }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('csrf_failed');
  });
});

describe('no console route writes without guard()', () => {
  /** Routes that exist before a session does; they cannot use a session guard. */
  const PRE_AUTH = new Set([join('auth', 'route.ts')]);

  /**
   * Specifiers a thin route file may delegate a write to instead of importing
   * `guard` itself. Each one is asserted below to actually reach the guard, so
   * the allow-list cannot be used to hide an unguarded handler.
   */
  const TRUSTED = new Map([
    ['@/lib/auth/login', 'src/lib/auth/login.ts'],
    ['@/lib/console/prefs-route', 'src/lib/console/prefs-route.ts'],
    // Every content and settings route is a one-line delegate to this module, which
    // puts each request through `guard()`; asserting that here keeps the route files
    // honest without repeating the import in five of them.
    ['@/lib/content/api', 'src/lib/content/api.ts'],
    // The saved-filter pair delegates the same way: the chips only ever hold one
    // person's own query string, so their route files stay one line long.
    ['@/lib/console/views-route', 'src/lib/console/views-route.ts'],
    // The leads trio (list, item, notes) is one handler and three one-line routes; the
    // source a write names comes from the query string, and the guard reads it there.
    ['@/lib/leads/api', 'src/lib/leads/api.ts'],
    // Accounts and roles: five route files, one handler each, all through `guard()`.
    // Accounts and permissions are the writes an Owner makes with no page to revert them,
    // so the thin delegate is the only shape allowed here.
    ['@/lib/users/api', 'src/lib/users/api.ts'],
    // Media: an upload is the one write that carries bytes, so both route files stay thin
    // delegates to this handler — the CSRF and `media.create` checks must run before a
    // single decoded byte reaches the disk.
    ['@/lib/media/api', 'src/lib/media/api.ts'],
    // Search appearance is one write shared by the SEO center and the panel inside every
    // entity page, so its route file stays a one-line delegate.
    ['@/lib/content/seo-api', 'src/lib/content/seo-api.ts'],
  ]);

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return routeFiles(full);
      return entry.endsWith('.ts') ? [relative(join(process.cwd(), 'src/app/api/console'), full)] : [];
    });
  }

  it('every file exporting POST/PUT/PATCH/DELETE imports the guard', () => {
    const files = routeFiles(join(process.cwd(), 'src/app/api/console'));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), 'src/app/api/console', file), 'utf8');
      const unsafe = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)/.test(source);
      if (!unsafe) continue;
      if (PRE_AUTH.has(file)) {
        // The login/logout pair is allowed to skip the session guard, but it may
        // not write: assert it holds no insert or update at all.
        expect(source, file).not.toMatch(/insertInto|updateTable|deleteFrom/);
        continue;
      }
      const reachesGuard =
        /from '@\/lib\/auth\/guard'/.test(source) ||
        [...TRUSTED.keys()].some((specifier) => source.includes(`from '${specifier}'`));
      expect(reachesGuard, `${file} must import the guard or a trusted module to export a write`).toBe(true);
    }
    // The transitive half of that rule: every trusted module reaches the guard.
    for (const path of TRUSTED.values()) {
      expect(readFileSync(join(process.cwd(), path), 'utf8'), path).toMatch(/\bguard[<(]/);
    }
  });
});
