import { describe, it, expect } from 'vitest';
import { kindSpec, parseWrites, type KindSpec } from '../src/lib/content/kinds';

/**
 * Regression test: result photos must NOT be dropped on save.
 *
 * Root cause: the `before`/`after` image fields were defined in the RESULTS list
 * schema but NOT in the `list_item` field spec, so `parseWrites()` rejected them
 * as "unknown field" and the photos were lost on save.
 *
 * This test asserts that a save carrying `before` and `after` image paths either:
 *  (a) goes through a spec that declares them as `image` fields, or
 *  (b) merges them into the `data` JSON column instead of dropping them.
 */
describe('results photos: do not drop on save', () => {
  it('list_item spec declares `before` and `after` image fields', () => {
    const spec = kindSpec('list_item');
    const imageFields = spec.image ?? [];
    const names = imageFields.map((f) => f.name);
    expect(names).toContain('before');
    expect(names).toContain('after');
  });

  it('parseWrites merges before/after image paths into the data JSON column', () => {
    const spec = kindSpec('list_item');
    const input = {
      fields: {
        before: '/uploads/202611/before.webp',
        after: '/uploads/202610/after.webp',
      },
    };
    const result = parseWrites(spec, input, 'ar');
    // The image paths must be merged into the data JSON column, not dropped.
    const data = JSON.parse(result.columns['draft'] as string) as Record<string, unknown>;
    expect(data.before).toBe('/uploads/202611/before.webp');
    expect(data.after).toBe('/uploads/202610/after.webp');
    // No "unknown field" issues for before/after.
    expect(result.issues.some((i) => i.path === 'before' || i.path === 'after')).toBe(false);
  });

  it('parseWrites clears a removed image path (empty string => delete key)', () => {
    const spec = kindSpec('list_item');
    const input = {
      fields: {
        before: '',
        after: '/uploads/202610/after.webp',
      },
    };
    const result = parseWrites(spec, input, 'ar');
    const data = JSON.parse(result.columns['draft'] as string) as Record<string, unknown>;
    expect(data.before).toBeUndefined();
    expect(data.after).toBe('/uploads/202610/after.webp');
  });
});
