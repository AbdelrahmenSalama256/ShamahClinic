/**
 * #245: which boxes in the console are picture controls, and where a picture hides in a JSON
 * document.
 *
 * This is the half that decides whether the owner's request is actually met: "any image added
 * by uploading not path or link, in whole cms". A picker wired to the fields this module
 * names `image` is only global if the naming is right — a gallery field nobody recognised
 * stays a text box, and that is the bug being reported. The walk is tested against the shapes
 * the database really holds (an offer's bilingual `images`, a list item's `data`), because a
 * helper proved only against a tidy fixture would miss the one that matters.
 */
import { describe, expect, it } from 'vitest';

import {
  appendSlot,
  imageSlots,
  isImageField,
  isUploadSrc,
  looksLikeImage,
  removeSlot,
  writeSlot,
  type FieldShape,
} from '../src/lib/console/image-field';

const text: FieldShape = { kind: 'text', multiline: false };
const bi: FieldShape = { kind: 'bi', multiline: false };
const area: FieldShape = { kind: 'bi', multiline: true };
const json: FieldShape = { kind: 'json', multiline: true };
const number: FieldShape = { kind: 'number', multiline: false };
const flag: FieldShape = { kind: 'flag', multiline: false };

describe('which field gets an upload control', () => {
  it('names the picture boxes by what they are called', () => {
    for (const name of ['image', 'photo', 'thumb', 'logo', 'banner', 'hero', 'avatar', 'cover', 'gallery', 'before', 'after', 'data-thumb']) {
      expect(isImageField(name, text), name).toBe(true);
      expect(isImageField(name, bi), name).toBe(true);
    }
  });

  it('leaves a caption a caption', () => {
    // `imageAlt` is the sentence under the picture. Giving it a file button would put a
    // path where an alt text belongs, which is the other half of the same complaint.
    for (const name of ['imageAlt', 'image_alt', 'imageCaption', 'photoText', 'logoLabel']) {
      expect(isImageField(name, text), name).toBe(false);
    }
    expect(isImageField('alt', text)).toBe(false);
  });

  it('refuses the shapes that cannot hold an address', () => {
    expect(isImageField('image', number)).toBe(false);
    expect(isImageField('image', flag)).toBe(false);
    expect(isImageField('images', json)).toBe(false);
    // A multiline box is prose even when its name mentions a picture.
    expect(isImageField('image', area)).toBe(false);
    expect(isImageField('title', text)).toBe(false);
    expect(isImageField('slug', text)).toBe(false);
  });
});

describe('an address a control will accept', () => {
  it('reads a path, a URL and a data URL as pictures only when they look like one', () => {
    expect(looksLikeImage('/uploads/202610/3f2a1c9d0b74.webp')).toBe(true);
    expect(looksLikeImage('/wp/2024/05/clinic.jpg')).toBe(true);
    expect(looksLikeImage('https://shamahclinics.com/media/hero.jpeg')).toBe(true);
    expect(looksLikeImage('data:image/png;base64,iVBOR')).toBe(true);
    expect(looksLikeImage('/images/hero.avif?v=2')).toBe(true);
    expect(looksLikeImage('  /images/hero.png  ')).toBe(true);
    expect(looksLikeImage('/about')).toBe(false);
    expect(looksLikeImage('hero')).toBe(false);
    expect(looksLikeImage('')).toBe(false);
    expect(looksLikeImage('   ')).toBe(false);
    expect(looksLikeImage(null)).toBe(false);
    expect(looksLikeImage(42)).toBe(false);
  });

  it('does not offer SVG as an uploadable picture', () => {
    // The byte reader refuses SVG on the way in, so a slot walk that found one would point
    // at a file the console cannot produce.
    expect(looksLikeImage('/images/wordmark.svg')).toBe(false);
  });

  it('recognises the address a stored upload carries', () => {
    expect(isUploadSrc('/uploads/202610/3f2a1c9d0b74.webp')).toBe(true);
    expect(isUploadSrc('/wp/2024/05/hero.jpg')).toBe(false);
  });
});

describe('the pictures inside a JSON document', () => {
  it('finds an offer gallery in both languages', () => {
    const images = { ar: [{ src: '/uploads/a.webp', alt: 'أ' }], en: [{ src: '/uploads/b.webp' }] };
    expect(imageSlots(images).map((slot) => slot.key)).toEqual(['ar.0.src', 'en.0.src']);
    expect(imageSlots(images).map((slot) => slot.path)).toEqual([
      ['ar', 0, 'src'],
      ['en', 0, 'src'],
    ]);
  });

  it('finds the keys a list document authors by hand', () => {
    const data = { thumb: '/images/t.jpg', title: { ar: 'ن', en: 'N' }, image: '/images/i.png', link: '/services/x' };
    expect(imageSlots(data).map((slot) => slot.key)).toEqual(['thumb', 'image']);
  });

  it('finds a bare array of addresses', () => {
    expect(imageSlots(['/images/1.jpg', '/images/2.jpg']).map((slot) => slot.key)).toEqual(['0', '1']);
  });

  it('names one picture once, and stops before a document becomes a wall', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ src: `/images/${index}.jpg` }));
    expect(imageSlots(many).length).toBe(24);
    expect(imageSlots(many, 3).length).toBe(3);
    // An object that is not a picture and not a container adds nothing.
    expect(imageSlots(null)).toEqual([]);
    expect(imageSlots('a sentence')).toEqual([]);
    expect(imageSlots({ note: 'plain text' })).toEqual([]);
  });

  it('swaps one address without touching the rest of the document', () => {
    const images = { ar: [{ src: '/uploads/a.webp', alt: 'أ' }], en: [{ src: '/uploads/b.webp' }] };
    const next = writeSlot(images, ['ar', 0, 'src'], '/uploads/c.webp');
    expect(next).toEqual({ ar: [{ src: '/uploads/c.webp', alt: 'أ' }], en: [{ src: '/uploads/b.webp' }] });
    // The form value is the person's text until they save: a swap must not hand back the
    // same object with its contents changed.
    expect(images.ar[0].src).toBe('/uploads/a.webp');
  });

  it('refuses a path that is not in the document instead of inventing a key', () => {
    const data = { thumb: '/images/t.jpg' };
    expect(writeSlot(data, ['caption'], '/images/x.jpg')).toEqual({ thumb: '/images/t.jpg' });
    expect(writeSlot(data, ['thumb', 'nope'], '/x.jpg')).toEqual(data);
    expect(writeSlot(data, [], '/x.jpg')).toBe('/x.jpg');
  });

  it('knows which pictures belong to a gallery and which are the only one', () => {
    const images = { ar: [{ src: '/a.webp', alt: 'أ' }], en: ['/b.jpg'] };
    const [first, second] = imageSlots(images);
    // `{ src }` elements: the array is `ar`, and a new one is written under the same key.
    expect(first.list).toEqual({ path: ['ar'], srcKey: 'src' });
    // a bare element is its own address.
    expect(second.list).toEqual({ path: ['en'], srcKey: '' });
    // A page's single `image` is not a gallery, so nothing may be appended to it.
    expect(imageSlots({ image: '/hero.jpg', title: 'x' })[0].list).toBeNull();
    expect(imageSlots([{ thumb: '/t.jpg', caption: 'one' }])[0].list).toBeNull();
  });

  it('removes a list element and nothing else', () => {
    const images = { ar: [{ src: '/a.webp' }, { src: '/b.webp' }, { src: '/c.webp' }] };
    const slots = imageSlots(images);
    // the whole element goes, not its `src` key
    expect(removeSlot(images, slots[1])).toEqual({ ar: [{ src: '/a.webp' }, { src: '/c.webp' }] });
    expect(removeSlot(['/a.jpg', '/b.jpg'], imageSlots(['/a.jpg', '/b.jpg'])[0])).toEqual(['/b.jpg']);
    // An object key is the site's contract, not a row in a gallery.
    expect(removeSlot({ thumb: '/t.jpg' }, imageSlots({ thumb: '/t.jpg' })[0])).toEqual({ thumb: '/t.jpg' });
  });

  it('adds beside the tile it was asked on, in that tile shape', () => {
    const images = { ar: [{ src: '/a.webp', alt: 'أ' }], en: ['/b.jpg'] };
    const [objectTile, stringTile] = imageSlots(images);
    expect(appendSlot(images, objectTile, '/z.webp')).toEqual({ ar: [{ src: '/a.webp', alt: 'أ' }, { src: '/z.webp' }], en: ['/b.jpg'] });
    expect(appendSlot(images, stringTile, '/z.jpg')).toEqual({ ar: [{ src: '/a.webp', alt: 'أ' }], en: ['/b.jpg', '/z.jpg'] });
    // A tile with no list cannot be added to.
    const single = imageSlots({ image: '/hero.jpg' })[0];
    expect(appendSlot({ image: '/hero.jpg' }, single, '/z.jpg')).toEqual({ image: '/hero.jpg' });
  });

  it('will not find a gallery in a document that holds no pictures', () => {
    // A `data` document of `{ url: '/a.pdf' }` names a file, not an image: the walk only
    // reports an address that reads as one.
    expect(imageSlots([{ url: '/a.pdf' }])).toEqual([]);
    expect(imageSlots('not json')).toEqual([]);
    expect(imageSlots({ href: '/about' })).toEqual([]);
    expect(imageSlots({ link: 'https://shamahclinics.com/services' })).toEqual([]);
  });
});
