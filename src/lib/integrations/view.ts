/**
 * What the console screen shows for the sheet connector: the URL reduced to something
 * recognisable, the headers, the script, the last test, and the delivery log.
 *
 * Kept apart from the request handler so the server page can render the same view the
 * API answers with, and so neither has to reach into the other's module.
 */
import { db } from '../db';
import { deliveryLog, readSheetsIntegration } from './delivery';
import { SHEETS_HEADERS, maskUrl, sheetsScript, type SheetsConfig } from './sheets';

export const SHEETS_TEST_GROUP = 'sheets';
export const SHEETS_TEST_KEY = 'last_test';

export interface TestResultRow {
  at: string;
  ok: boolean;
  status: number;
  error: string;
}

export interface SheetsView {
  integration: {
    configured: boolean;
    enabled: boolean;
    maskedUrl: string;
    urlSet: boolean;
    tokenSet: boolean;
    lastError: string | null;
  };
  headers: readonly string[];
  script: string;
  lastTest: TestResultRow | null;
  log: Awaited<ReturnType<typeof deliveryLog>>;
}

export async function readLastTest(): Promise<TestResultRow | null> {
  const row = await db
    .selectFrom('settings')
    .select('value')
    .where('group_name', '=', SHEETS_TEST_GROUP)
    .where('setting_key', '=', SHEETS_TEST_KEY)
    .executeTakeFirst();
  if (!row) return null;
  const value = typeof row.value === 'string' ? safeJson(row.value) : row.value;
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Partial<TestResultRow>;
  if (typeof candidate.at !== 'string' || typeof candidate.ok !== 'boolean') return null;
  return {
    at: candidate.at,
    ok: candidate.ok,
    status: typeof candidate.status === 'number' ? candidate.status : 0,
    error: typeof candidate.error === 'string' ? candidate.error : '',
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** The connector as the console may see it: the URL reduced, the token never printed. */
export async function sheetsView(): Promise<SheetsView> {
  const integration = await readSheetsIntegration();
  const [log, lastTest] = await Promise.all([deliveryLog(50), readLastTest()]);
  const config: SheetsConfig = integration?.config ?? { url: '', token: '', enabled: false };
  return {
    integration: {
      configured: integration !== null,
      enabled: integration?.enabled === true,
      maskedUrl: config.url ? maskUrl(config.url) : '',
      urlSet: config.url !== '',
      tokenSet: config.token !== '',
      lastError: integration?.lastError ?? null,
    },
    headers: SHEETS_HEADERS,
    script: sheetsScript(),
    lastTest,
    log,
  };
}
