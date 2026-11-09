import { describe, expect, it } from 'vitest';
import { seoGrade, seoScore } from '../src/lib/content/seo-score';
import { normalizeSeoConfig, robotsExtraRules, safeImageRef, verificationToken } from '../src/lib/content/seo-config-shape';

const body = (words: number, extra = '') =>
  `<p>ليزر ازالة الشعر ${'كلمة '.repeat(words)}</p><h2>عن ليزر إزالة الشعر</h2>${extra}<p>${'نص '.repeat(20)} ليزر إزالة الشعر</p>`;

describe('the SEO score', () => {
  it('grades a page that does everything right as good', () => {
    const result = seoScore({
      focusKeyword: 'ليزر إزالة الشعر',
      title: 'ليزر إزالة الشعر في القاهرة — جلسات آمنة وفعالة',
      description: 'ليزر إزالة الشعر في عيادات شامه بأحدث الأجهزة، نتائج تدوم وجلسات آمنة لكل أنواع البشرة مع متابعة طبيب الجلدية خطوة بخطوة.',
      path: '/blogs/%D9%84%D9%8A%D8%B2%D8%B1-%D8%A7%D8%B2%D8%A7%D9%84%D8%A9-%D8%A7%D9%84%D8%B4%D8%B9%D8%B1',
      body: body(420, '<img src="/a.webp" alt="جهاز الليزر">'),
      ogImage: '/uploads/a.webp',
    });
    expect(result.checks.filter((check) => !check.pass).map((check) => check.id)).toEqual([]);
    expect(result.score).toBe(100);
    expect(seoGrade(result.score)).toBe('good');
  });

  it('folds Arabic letter forms, so إزالة finds ازالة', () => {
    const result = seoScore({ focusKeyword: 'إزالة', title: 'ازالة الشعر', description: '', path: '/x', body: null, ogImage: '' });
    expect(result.checks.find((check) => check.id === 'keyword_title')?.pass).toBe(true);
  });

  it('leaves out what it cannot judge instead of failing it', () => {
    const ids = seoScore({ focusKeyword: '', title: 'x', description: '', path: '/x', body: null, ogImage: '' }).checks.map((check) => check.id);
    expect(ids).not.toContain('content_length');
    expect(ids).not.toContain('keyword_title');
    expect(ids).toContain('keyword_set');
  });

  it('fails a picture without alt text', () => {
    const result = seoScore({ focusKeyword: '', title: '', description: '', path: '/x', body: '<img src="/a.webp">', ogImage: '' });
    expect(result.checks.find((check) => check.id === 'image_alt')?.pass).toBe(false);
  });
});

describe('the SEO settings document', () => {
  it('fills every missing key with its default', () => {
    expect(normalizeSeoConfig(null)).toMatchObject({ indexing: true, separator: '|', sitemap: { services: true, offers: true, articles: true, branches: true } });
  });

  it('keeps indexing off only when it was explicitly turned off', () => {
    expect(normalizeSeoConfig({ indexing: false }).indexing).toBe(false);
    expect(normalizeSeoConfig({ indexing: 'no' }).indexing).toBe(true);
  });

  it('reads a verification code from a pasted meta tag', () => {
    expect(verificationToken('<meta name="google-site-verification" content="abc123" />')).toBe('abc123');
    expect(verificationToken('  abc123 ')).toBe('abc123');
  });

  it('drops a share image that is neither on this site nor https', () => {
    expect(safeImageRef('/uploads/a.webp')).toBe('/uploads/a.webp');
    expect(safeImageRef('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(safeImageRef('//evil.example/a.jpg')).toBe('');
    expect(safeImageRef('javascript:alert(1)')).toBe('');
  });

  it('keeps only rooted Allow/Disallow lines for robots.txt', () => {
    expect(robotsExtraRules('Disallow: /private\nallow: /private/open\nUser-agent: *\nSitemap: https://x\nDisallow: nope')).toEqual({
      allow: ['/private/open'],
      disallow: ['/private'],
    });
  });

  it('normalizes the X handle and refuses a junk Facebook id', () => {
    const config = normalizeSeoConfig({ twitterSite: 'shamah', facebookAppId: 'abc', separator: '<script>' });
    expect(config.twitterSite).toBe('@shamah');
    expect(config.facebookAppId).toBe('');
    expect(config.separator).toBe('|');
  });
});
