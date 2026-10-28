/**
 * The SEO center's rules, with no browser and no database.
 *
 * Three of them are the kind that fail silently: a status that counts bytes instead of
 * characters calls an Arabic title long when it is short, a path check that accepts `..`
 * lets the screen write a record no page will ever read, and a route table that disagrees
 * with the public route list shows a row for a page that does not exist. The fourth is a
 * source assertion: the metadata builder has to be the single place the override is read,
 * because a page that bypasses it would ignore the screen without saying so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { can, type Grant } from '../src/lib/auth/permissions';
import { ROLE_SEEDS, type RoleName } from '../src/lib/auth/roles';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoLength, seoStatus, worstStatus } from '../src/lib/content/seo-limits';
import { isSeoPath, seoPathOf } from '../src/lib/content/seo';
import { SITE_SEO } from '../src/lib/content/seo-defaults';

/**
 * The matrix, in one table before any code is trusted with it.
 *
 * `seo` is the console's own resource, not a content grant: an Editor who may publish an
 * article still may not rewrite its search title, and a Marketer who owns leads still
 * reads these rows without touching them. The SEO role exists for exactly these writes.
 */
describe('who may read and write the SEO section', () => {
  const grantsOf = (name: RoleName): Grant[] => {
    const seed = ROLE_SEEDS.find((role) => role.name === name);
    if (!seed) throw new Error(`no seed for ${name}`);
    return seed.grants.flatMap((grant) =>
      grant.actions.map((action) => ({ resource: grant.resource, action, scope: grant.scope ?? null })),
    );
  };

  const MATRIX: Record<RoleName, { read: boolean; update: boolean; publish: boolean }> = {
    Owner: { read: true, update: true, publish: true },
    Admin: { read: true, update: true, publish: true },
    Editor: { read: true, update: false, publish: false },
    SEO: { read: true, update: true, publish: true },
    Marketer: { read: true, update: false, publish: false },
    Viewer: { read: true, update: false, publish: false },
  };

  it('gives every role the screen but only three roles the fields', () => {
    for (const [name, expected] of Object.entries(MATRIX) as [RoleName, (typeof MATRIX)[RoleName]][]) {
      const grants = grantsOf(name);
      expect({ read: can(grants, 'seo', 'read'), update: can(grants, 'seo', 'update'), publish: can(grants, 'seo', 'publish') }, name).toEqual(expected);
    }
  });

  it('does not hand the SEO writes to a content writer or a marketer', () => {
    // Spelled out because this is the pair that looks reasonable and is not.
    expect(can(grantsOf('Editor'), 'seo', 'update'), 'Editor').toBe(false);
    expect(can(grantsOf('Marketer'), 'seo', 'update'), 'Marketer').toBe(false);
    expect(can(grantsOf('SEO'), 'seo', 'update'), 'SEO').toBe(true);
  });
});

describe('a title is judged by what a person sees, not by its bytes', () => {
  it('counts code points, so an Arabic or emoji title is not called long early', () => {
    expect(seoLength('  رحمة  ')).toBe(4);
    expect(seoLength('👩🏼‍💊')).toBe(4);
    expect(seoStatus('ر'.repeat(SEO_TITLE_MAX), SEO_TITLE_MAX)).toBe('ok');
    expect(seoStatus('ر'.repeat(SEO_TITLE_MAX + 1), SEO_TITLE_MAX)).toBe('long');
    expect(seoStatus('d'.repeat(SEO_DESCRIPTION_MAX), SEO_DESCRIPTION_MAX)).toBe('ok');
    expect(seoStatus('d'.repeat(SEO_DESCRIPTION_MAX + 1), SEO_DESCRIPTION_MAX)).toBe('long');
  });

  it('calls whitespace missing and reads the row through the worst field', () => {
    expect(seoStatus('   ', SEO_TITLE_MAX)).toBe('missing');
    expect(worstStatus('ok', 'ok')).toBe('ok');
    expect(worstStatus('ok', 'long')).toBe('long');
    expect(worstStatus('long', 'missing')).toBe('missing');
  });
});

describe('an override is keyed by an address a page can actually be served at', () => {
  it('accepts the home page and one leading slash, and nothing a browser would rewrite', () => {
    expect(isSeoPath('')).toBe(true);
    expect(isSeoPath('/about')).toBe(true);
    expect(isSeoPath('/')).toBe(true);
    expect(isSeoPath('about')).toBe(false);
    expect(isSeoPath('//evil.example')).toBe(false);
    expect(isSeoPath('/services/../admin')).toBe(false);
    expect(isSeoPath(`/${'a'.repeat(191)}`)).toBe(false);
  });

  it('maps each entity to the path the site serves, and says when it has none', () => {
    expect(seoPathOf('article', 'laser-hair-removal')).toBe('/blogs/laser-hair-removal');
    expect(seoPathOf('offer', 'winter-package')).toBe('/offers/winter-package');

    expect(seoPathOf('page', 'home')).toBe('');
    expect(seoPathOf('page', 'about')).toBe('/about');
    // Two builder names can point at one route; the canonical one wins.
    expect(seoPathOf('page', 'shop')).toBe('/offers');
    expect(seoPathOf('page', 'shop-2')).toBe('/offers');
    // An imported page with no route is not inventing an address from its builder name.
    expect(seoPathOf('page', 'creative-slider')).toBeNull();

    expect(seoPathOf('list_item', 'nasr-city', 'branches')).toBe('/branches/nasr-city');
    expect(seoPathOf('list_item', 'laser', 'services')).toBe('/services/laser');
    // The old `/treatments/` segment redirects to the service page.
    expect(seoPathOf('list_item', 'laser', 'treatments')).toBe('/services/laser');
    // Results, FAQ and doctors are sections of one page, and `nav` is not a page at all.
    for (const listKey of ['results', 'faq', 'specialists', 'nav']) {
      expect(seoPathOf('list_item', 'row', listKey), listKey).toBeNull();
    }
  });

  it('has a default pair for every route the page map names', () => {
    for (const key of ['', '/about', '/services', '/offers', '/blogs', '/faq', '/contact', '/privacy', '/results', '/doctors', '/branches']) {
      expect(SITE_SEO[key], key).toBeTruthy();
    }
  });
});

describe('the site reads the override through its one metadata builder', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/seo.ts'), 'utf8');

  it('merges the stored pair over the authored one for the URL’s language', () => {
    expect(source).toMatch(/readSeoOverride\(path, lang\)/);
    expect(source).toMatch(/override\?\.title \|\| title\[lang\] \|\| title\[other\]/);
    expect(source).toMatch(/override\?\.description \|\| description\[lang\] \|\| description\[other\]/);
  });

  it('does not cache the read: an SEO edit must reach the next fetch', () => {
    // `revalidateSeo()` clears the page on save. A memo here would undo that promise.
    expect(source).not.toMatch(/unstable_cache|react\(.*cache|force-cache/);
  });
});
