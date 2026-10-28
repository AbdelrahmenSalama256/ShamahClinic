import { describe, expect, it, vi } from 'vitest';
import {
  PROVIDER_HOSTS,
  TRACKING_PROVIDERS,
  normalizeConfig,
  planTags,
  validateId,
  type ProviderKey,
  type TrackingConfig,
} from '@/lib/tracking/providers';
import { providerSnippet, snippetPlan, tagHosts } from '@/lib/tracking/snippets';
import { EVENT_NAMES, TRACKING_EVENTS, cleanParams, dispatchEvent, type EventSink } from '@/lib/tracking/events';

function config(rows: Partial<Record<ProviderKey, { id: string; label?: string; enabled?: boolean }>>): TrackingConfig {
  const out: TrackingConfig = {};
  for (const [key, row] of Object.entries(rows)) {
    out[key as ProviderKey] = { id: row.id, label: row.label, enabled: row.enabled !== false };
  }
  return out;
}

describe('provider registry', () => {
  it('accepts each provider\'s example and rejects junk', () => {
    for (const provider of TRACKING_PROVIDERS) {
      expect(validateId(provider, provider.example), provider.key).toEqual({ ok: true, value: provider.example });
      expect(validateId(provider, `<script>${provider.example}</script>`), provider.key).toMatchObject({ ok: false });
      expect(validateId(provider, ' '), provider.key).toEqual({ ok: false, reason: 'empty' });
      expect(validateId(provider, 42), provider.key).toEqual({ ok: false, reason: 'empty' });
    }
  });

  it('rejects a conversion label that could escape its quotes', () => {
    const ads = TRACKING_PROVIDERS.find((provider) => provider.key === 'ads')!;
    expect(validateId(ads, 'AW-123456789', "';alert(1)//")).toEqual({ ok: false, reason: 'label' });
    expect(validateId(ads, 'AW-123456789', 'AbC_123-4')).toEqual({ ok: true, value: 'AW-123456789' });
  });

  it('keeps only rows that name an ID', () => {
    const normalized = normalizeConfig({
      ga4: { id: ' G-ABC123 ', enabled: true },
      meta: { id: '', enabled: true },
      tiktok: 'nope',
      unknown: { id: 'X', enabled: true },
    });
    expect(normalized).toEqual({ ga4: { id: 'G-ABC123', enabled: true } });
    expect(normalizeConfig(null)).toEqual({});
  });
});

describe('planTags', () => {
  it('lets a Tag Manager container own the Google tags instead of loading them twice', () => {
    const plan = planTags(
      config({
        gtm: { id: 'GTM-ABC1234' },
        ga4: { id: 'G-ABC123XYZ9' },
        ads: { id: 'AW-123456789', label: 'AbC123' },
        meta: { id: '123456789012345' },
      }),
    );
    expect(plan.gtm).toBe('GTM-ABC1234');
    expect(plan.gtagIds).toEqual([]);
    expect(plan.ads).toBeNull();
    expect(plan.suppressed).toEqual(['ga4', 'ads']);
    expect(plan.vendors).toEqual([{ key: 'meta', id: '123456789012345' }]);
  });

  it('shares one Google loader between Analytics and Ads when Tag Manager is off', () => {
    const plan = planTags(
      config({
        ga4: { id: 'G-ABC123XYZ9' },
        ads: { id: 'AW-123456789', label: 'AbC123' },
      }),
    );
    expect(plan.gtm).toBeNull();
    expect(plan.gtagIds).toEqual(['G-ABC123XYZ9', 'AW-123456789']);
    expect(plan.ads).toEqual({ id: 'AW-123456789', label: 'AbC123' });
    expect(plan.suppressed).toEqual([]);
  });

  it('saves a switched-off row without injecting it', () => {
    const plan = planTags(config({ meta: { id: '123456789012345', enabled: false } }));
    expect(plan.vendors).toEqual([]);
    expect(plan.invalid).toEqual([]);
  });

  it('names a saved but unusable row instead of silently dropping it', () => {
    const plan = planTags(config({ hotjar: { id: 'not-a-number' } }));
    expect(plan.invalid).toEqual(['hotjar']);
    expect(plan.vendors).toEqual([]);
  });
});

describe('snippets', () => {
  it('gives every enabled provider exactly one snippet, each carrying only its own ID', () => {
    const plan = planTags(
      config({
        ga4: { id: 'G-ABC123XYZ9' },
        ads: { id: 'AW-123456789', label: 'AbC123' },
        meta: { id: '123456789012345' },
        tiktok: { id: 'CABC123DEF456GHI' },
        snapchat: { id: '4f5c1e2a-8b3d-4c6f-9a1b-2d3e4f5a6b7c' },
        clarity: { id: 'k2m9x4p7qd' },
        hotjar: { id: '1234567' },
        bing: { id: '12345678' },
      }),
    );
    const entries = snippetPlan(plan);
    expect(entries.map((entry) => entry.key)).toEqual([
      'ads',
      'meta',
      'tiktok',
      'snapchat',
      'clarity',
      'hotjar',
      'bing',
    ]);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
    for (const { key, snippet } of entries) {
      expect(snippet.inline, key).not.toMatch(/<\/?script/i);
      expect(snippet.inline.length, key).toBeGreaterThan(40);
    }
    const google = entries[0].snippet;
    expect(google.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ9');
    expect(google.inline).toContain("gtag('config','G-ABC123XYZ9');");
    expect(google.inline).toContain("gtag('config','AW-123456789',{send_to:'AW-123456789/AbC123'});");
  });

  it('loads one Google tag, not one per ID', () => {
    const plan = planTags(config({ ga4: { id: 'G-ABC123XYZ9' }, ads: { id: 'AW-123456789' } }));
    const hosts = tagHosts(plan);
    expect(hosts).toEqual(['www.googletagmanager.com']);
    expect(snippetPlan(plan)).toHaveLength(1);
  });

  it('contacts only provider hosts, and each once per plan', () => {
    const plan = planTags(
      config({
        meta: { id: '123456789012345' },
        tiktok: { id: 'CABC123DEF456GHI' },
        snapchat: { id: '4f5c1e2a-8b3d-4c6f-9a1b-2d3e4f5a6b7c' },
        clarity: { id: 'k2m9x4p7qd' },
        hotjar: { id: '1234567' },
        bing: { id: '12345678' },
      }),
    );
    const hosts = tagHosts(plan);
    expect(hosts.sort()).toEqual(
      ['analytics.tiktok.com', 'bat.bing.com', 'connect.facebook.net', 'sc-static.net', 'static.hotjar.com', 'www.clarity.ms'].sort(),
    );
    for (const host of hosts) expect(PROVIDER_HOSTS).toContain(host);
    const text = snippetPlan(plan)
      .map((entry) => entry.snippet.inline)
      .join('\n');
    for (const host of hosts) {
      expect(text.match(new RegExp(`https://${host.replace(/\./g, '\\.')}/`, 'g')), host).toHaveLength(1);
    }
  });

  it('builds a snippet from an ID and nothing else', () => {
    const snippet = providerSnippet('meta', '123456789012345');
    expect(snippet.inline).toContain("fbq('init','123456789012345')");
    expect(snippet.inline).not.toContain('undefined');
  });
});

describe('events', () => {
  it('publishes the names dashboards are built on', () => {
    expect(TRACKING_EVENTS).toEqual(['lead_submitted', 'phone_click', 'whatsapp_click']);
    expect(EVENT_NAMES.leadSubmitted).toBe('lead_submitted');
  });

  it('writes one dataLayer entry and calls each installed vendor once', () => {
    const sink: EventSink = {
      dataLayer: [],
      gtag: vi.fn(),
      fbq: vi.fn(),
      ttq: { track: vi.fn() },
      snaptr: vi.fn(),
      uetq: { push: vi.fn() },
      clarity: vi.fn(),
      hj: vi.fn(),
    };
    dispatchEvent(sink, 'lead_submitted', { service: 'teeth-whitening', empty: '', missing: undefined });

    expect(sink.dataLayer).toEqual([{ event: 'lead_submitted', service: 'teeth-whitening' }]);
    expect(sink.gtag).toHaveBeenCalledWith('event', 'lead_submitted', { service: 'teeth-whitening' });
    expect(sink.fbq).toHaveBeenCalledWith('trackCustom', 'lead_submitted', { service: 'teeth-whitening' });
    expect(sink.ttq!.track).toHaveBeenCalledOnce();
    expect(sink.snaptr).toHaveBeenCalledWith('track', 'SIGN_UP');
    expect(sink.uetq!.push).toHaveBeenCalledWith('event', 'lead_submitted', { service: 'teeth-whitening' });
    expect(sink.clarity).toHaveBeenCalledWith('event', 'lead_submitted');
    expect(sink.hj).toHaveBeenCalledWith('event', 'lead_submitted');
  });

  it('skips vendors that are not on the page', () => {
    expect(() => dispatchEvent({}, 'phone_click')).not.toThrow();
    expect(cleanParams({ a: 1, b: null, c: '', d: false })).toEqual({ a: 1, d: false });
  });
});
