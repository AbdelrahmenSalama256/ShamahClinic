/**
 * The site-wide SEO settings, read once per request. A database that cannot answer is
 * the defaults — indexing on, nothing extra — because a public page must never go
 * noindex on the strength of a failed query.
 *
 * The two verification codes the Settings screen used to own (`seo / verification.*`)
 * stay readable here: a code saved there before this screen existed keeps working until
 * someone saves the new form.
 */
import { cache } from 'react';
import { db } from '../db';
import { SEO_CONFIG_DEFAULTS, SEO_CONFIG_GROUP, SEO_CONFIG_KEY, normalizeSeoConfig, verificationToken, type SeoConfig } from './seo-config-shape';
import { writeSetting } from './settings';

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const getSeoConfig = cache(async function getSeoConfig(): Promise<SeoConfig> {
  try {
    const rows = await db
      .selectFrom('settings')
      .select(['setting_key', 'value'])
      .where('group_name', '=', SEO_CONFIG_GROUP)
      .where('setting_key', 'in', [SEO_CONFIG_KEY, 'verification.google', 'verification.bing'])
      .execute();
    const byKey = new Map(rows.map((row) => [row.setting_key, decode(row.value)]));
    const config = normalizeSeoConfig(byKey.get(SEO_CONFIG_KEY));
    for (const engine of ['google', 'bing'] as const) {
      const legacy = byKey.get(`verification.${engine}`);
      if (!config.verification[engine] && typeof legacy === 'string') config.verification[engine] = verificationToken(legacy);
    }
    return config;
  } catch {
    return SEO_CONFIG_DEFAULTS;
  }
});

export async function saveSeoConfig(value: unknown, actorId: string): Promise<SeoConfig | null> {
  const config = normalizeSeoConfig(value);
  const saved = await writeSetting({ group: SEO_CONFIG_GROUP, key: SEO_CONFIG_KEY, value: config, actorId });
  return saved.ok ? config : null;
}
