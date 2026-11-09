import { describe, expect, it } from 'vitest';
import {
  isProbePath,
  isSelfRedirect,
  matchRedirect,
  normalizeRedirectPath,
  normalizeRedirectTarget,
  type RedirectRule,
} from '../src/lib/content/redirect-rules';

const rule = (source: string, target: string, match: 'exact' | 'prefix' = 'exact', status: 301 | 302 = 301): RedirectRule => ({
  id: `${source}->${target}`,
  source,
  target,
  status,
  match,
});

describe('one spelling for an address', () => {
  it('folds case, trailing slashes, queries and full URLs to the path', () => {
    expect(normalizeRedirectPath('/Old-Page/')).toBe('/old-page');
    expect(normalizeRedirectPath('https://shamahclinics.com/old-page?utm_source=x#top')).toBe('/old-page');
    expect(normalizeRedirectPath('/a//b')).toBe('/a/b');
  });

  it('treats a pasted Arabic address and its escaped form as the same rule', () => {
    expect(normalizeRedirectPath('/%D9%84%D9%8A%D8%B2%D8%B1')).toBe('/ليزر');
  });

  it('refuses addresses a redirect must never capture', () => {
    expect(normalizeRedirectPath('/console/seo')).toBeNull();
    expect(normalizeRedirectPath('/api/v1/lead')).toBeNull();
    expect(normalizeRedirectPath('//evil.example')).toBeNull();
    expect(normalizeRedirectPath('old-page')).toBeNull();
  });

  it('accepts a local path or an http(s) target and nothing else', () => {
    expect(normalizeRedirectTarget('/services')).toBe('/services');
    expect(normalizeRedirectTarget('https://example.com/x')).toBe('https://example.com/x');
    expect(normalizeRedirectTarget('//evil.example')).toBeNull();
    expect(normalizeRedirectTarget('javascript:alert(1)')).toBeNull();
  });
});

describe('which rule answers a request', () => {
  const rules = [rule('/old', '/services'), rule('/old-blog', '/blogs', 'prefix'), rule('/old-blog/special', '/offers'), rule('/promo', '/offers', 'exact', 302)];

  it('prefers an exact rule over a prefix that also matches', () => {
    expect(matchRedirect(rules, '/old-blog/special')?.location).toBe('/offers');
  });

  it('carries the rest of the path over on a prefix rule', () => {
    expect(matchRedirect(rules, '/old-blog/laser-tips')?.location).toBe('/blogs/laser-tips');
    expect(matchRedirect(rules, '/old-blog')?.location).toBe('/blogs');
  });

  it('does not let a prefix match the middle of a word', () => {
    expect(matchRedirect(rules, '/old-blogger')).toBeNull();
  });

  it('matches regardless of case and keeps the rule status', () => {
    expect(matchRedirect(rules, '/PROMO/')?.rule.status).toBe(302);
  });

  it('answers nothing for an address without a rule', () => {
    expect(matchRedirect(rules, '/services')).toBeNull();
  });
});

describe('guards', () => {
  it('spots a rule that would redirect to itself', () => {
    expect(isSelfRedirect('/a', '/A/', 'exact')).toBe(true);
    expect(isSelfRedirect('/a', '/a/b', 'prefix')).toBe(true);
    expect(isSelfRedirect('/a', '/b', 'prefix')).toBe(false);
    expect(isSelfRedirect('/a', 'https://other.example/a', 'exact')).toBe(false);
  });

  it('drops scanner probes from the 404 log', () => {
    expect(isProbePath('/wp-login.php')).toBe(true);
    expect(isProbePath('/.env')).toBe(true);
    expect(isProbePath('/old-article')).toBe(false);
  });
});
