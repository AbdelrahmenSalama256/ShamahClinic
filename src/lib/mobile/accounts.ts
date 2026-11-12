/**
 * Patients of the mobile app: their records, passwords and bearer tokens.
 *
 * The token is 32 random bytes handed to the app once; only its SHA-256 is stored,
 * so a database dump cannot be replayed. Tokens live 180 days and slide forward on
 * use — a patient who opens the app monthly is never asked to sign in again.
 */
import { randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql } from 'kysely';
import { db } from '@/lib/db';
import { randomToken, sha256 } from '@/lib/auth/tokens';

const TOKEN_TTL_DAYS = 180;
const BCRYPT_COST = 10;
/** Compared when no account matches, so a wrong phone costs what a wrong password does. */
const DECOY_HASH = '$2b$10$uW0K/oZdL.rdGOn8WoS/geUf6guxLghrOjAf2jJTwnRMSyXCoox5W';

export interface Customer {
  id: string;
  code: string;
  first_name: string;
  second_name: string;
  phone: string;
  email: string;
  image_url: string;
  blocked: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function checkPassword(password: string, hash: string | null): Promise<boolean> {
  try {
    const matched = await bcrypt.compare(password, hash ?? DECOY_HASH);
    return matched && hash !== null;
  } catch {
    return false;
  }
}

/** Letters and digits, 8+ characters — the same rule the app's form enforces. */
export function passwordOk(password: string): boolean {
  return /^(?=.*[A-Za-z؀-ۿ])(?=.*\d).{8,72}$/.test(password);
}

const CUSTOMER_COLUMNS = ['id', 'code', 'first_name', 'second_name', 'phone', 'email', 'image_url', 'blocked'] as const;

export async function customerByPhone(phone: string): Promise<(Customer & { password_hash: string }) | null> {
  const row = await db
    .selectFrom('app_customers')
    .select([...CUSTOMER_COLUMNS, 'password_hash'])
    .where('phone', '=', phone)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ?? null;
}

export async function customerById(id: string): Promise<Customer | null> {
  const row = await db
    .selectFrom('app_customers')
    .select([...CUSTOMER_COLUMNS])
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ?? null;
}

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `SC${randomInt(100000, 999999)}`;
    const taken = await db.selectFrom('app_customers').select('id').where('code', '=', code).executeTakeFirst();
    if (!taken) return code;
  }
  return `SC${Date.now().toString().slice(-8)}`;
}

export async function createCustomer(input: {
  firstName: string;
  secondName: string;
  phone: string;
  password: string;
  locale: string;
}): Promise<Customer> {
  const id = randomUUID();
  await db
    .insertInto('app_customers')
    .values({
      id,
      code: await uniqueCode(),
      first_name: input.firstName.slice(0, 120),
      second_name: input.secondName.slice(0, 120),
      phone: input.phone,
      password_hash: await hashPassword(input.password),
      locale: input.locale === 'en' ? 'en' : 'ar',
    })
    .execute();
  const created = await customerById(id);
  if (!created) throw new Error('customer was not created');
  return created;
}

export async function issueToken(customerId: string, userAgent: string): Promise<string> {
  const token = randomToken();
  await db
    .insertInto('app_tokens')
    .values({
      id: randomUUID(),
      customer_id: customerId,
      token_hash: sha256(token),
      user_agent: userAgent.slice(0, 255),
      expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000),
    })
    .execute();
  await db.updateTable('app_customers').set({ last_login_at: new Date() }).where('id', '=', customerId).execute();
  return token;
}

/** The patient behind a bearer token, or null for a missing, expired or revoked one. */
export async function customerForToken(token: string): Promise<Customer | null> {
  if (!token) return null;
  const hash = sha256(token);
  const row = await db
    .selectFrom('app_tokens')
    .select(['id', 'customer_id', 'expires_at', 'last_used_at'])
    .where('token_hash', '=', hash)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row || row.expires_at.getTime() < Date.now()) return null;
  const customer = await customerById(row.customer_id);
  if (!customer || customer.blocked) return null;
  // Slide the expiry at most once an hour, so a busy session is not a write per call.
  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > 3_600_000) {
    await db
      .updateTable('app_tokens')
      .set({ last_used_at: new Date(), expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000) })
      .where('id', '=', row.id)
      .execute();
  }
  return customer;
}

export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  await db.updateTable('app_tokens').set({ revoked_at: new Date() }).where('token_hash', '=', sha256(token)).execute();
}

export async function revokeAllTokens(customerId: string, exceptToken?: string): Promise<void> {
  let query = db
    .updateTable('app_tokens')
    .set({ revoked_at: new Date() })
    .where('customer_id', '=', customerId)
    .where('revoked_at', 'is', null);
  if (exceptToken) query = query.where('token_hash', '<>', sha256(exceptToken));
  await query.execute();
}

export async function pointsBalance(customerId: string): Promise<number> {
  const row = await db
    .selectFrom('app_loyalty')
    .select(sql<string | number | null>`SUM(CASE WHEN type = 1 THEN -ABS(points) ELSE points END)`.as('total'))
    .where('customer_id', '=', customerId)
    .executeTakeFirst();
  return Number(row?.total ?? 0) || 0;
}

/** The `user` object the app caches after login. */
export async function userJson(customer: Customer): Promise<Record<string, unknown>> {
  const fullName = [customer.first_name, customer.second_name].filter(Boolean).join(' ');
  return {
    id: customer.id,
    code: customer.code,
    first_name: customer.first_name,
    second_name: customer.second_name,
    full_name: fullName,
    phone_number: customer.phone,
    email: customer.email,
    image_url: customer.image_url,
    loyalty_program_points: await pointsBalance(customer.id),
  };
}
