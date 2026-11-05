/**
 * Which editor fields hold a picture, and where inside a JSON document those pictures sit.
 *
 * The console has one rule about images now: a person uploads a file and the site stores the
 * address the server handed back. That only holds if every place an address can live offers
 * an upload — so the detection has to be one function the field row, the gallery and the
 * preview strip all call, not three regexes that drift.
 *
 * The walk over a JSON value is deliberately shape-based, not field-name-based: offers keep
 * `images` as `{ ar: [{ src, alt }], en: [...] }`, a list item's `data` keeps whatever key its
 * own list authored (`thumb`, `image`, a bare array of addresses), and a page keeps one
 * `image` string. A walk that trusted a shape would silently stop finding pictures the first
 * time a list is edited by hand.
 */

/** A field whose *name* says it is a picture. `imageAlt` says it is a caption, so that is excluded. */
const IMAGE_NAME = /image|photo|thumb|logo|banner|hero|avatar|cover|gallery|before|after/i;
const ALT_NAME = /alt|caption|text|note|label|title/i;

/** Keys that carry an address inside a document. */
const IMAGE_KEY = /^(src|image|img|photo|thumb|thumbnail|logo|banner|hero|avatar|cover|icon|before|after|url)$/i;

/** The key a gallery element keeps its address under, and the only one an element may be added with. */
const GALLERY_KEY = /^src$/i;

/**
 * The value has to look like an address before a box is treated as a picture control.
 *
 * A rooted path is not enough: `/about` is a link, and a control that read it as a picture
 * would offer a file button on a nav field. Either the bytes say `data:image/` or the last
 * segment carries a picture extension.
 */
const IMAGE_EXT = /\.(avif|webp|jpe?g|png|gif)(\?|#|$)/i;

export type FieldShape = { kind: 'bi' | 'json' | 'text' | 'date' | 'number' | 'flag'; multiline: boolean };

/**
 * A field this console should put an upload control on.
 *
 * A multiline text field is prose even when its name mentions a picture (`image_caption`),
 * and a number, a day, a flag or a document is never one, so those are refused by shape
 * rather than by name.
 */
export function isImageField(name: string, field: FieldShape): boolean {
  if (field.kind === 'number' || field.kind === 'date' || field.kind === 'flag' || field.kind === 'json') return false;
  if (field.multiline) return false;
  if (ALT_NAME.test(name)) return false;
  return IMAGE_NAME.test(name);
}

/**
 * A JSON field whose whole document is pictures — an offer's `images`, a banner strip.
 *
 * These render as a gallery and **nothing else**: the document has no text a person needs
 * to type, and a box that accepts an address by hand is the thing uploads replaced.
 */
export function isImageGalleryField(name: string, field: FieldShape): boolean {
  return field.kind === 'json' && IMAGE_NAME.test(name);
}

/** A string that reads as an image address — a `data:` image or a file with a picture extension. */
export function looksLikeImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text !== '' && (text.startsWith('data:image/') || IMAGE_EXT.test(text));
}

/**
 * Where a picture lives inside a document.
 *
 * `path` is enough to swap the address. `list` says whether the picture is an element of an
 * array the site reads as a gallery, which is the only thing that makes an "add another
 * picture" button honest: it appends a sibling of the tile it was pressed on, shaped like
 * that tile, instead of inventing a key the reader never looks at.
 */
export interface ImageSlot {
  /** `path` joined — stable enough for a React key and for matching a click to a slot. */
  key: string;
  path: (string | number)[];
  src: string;
  /** The array this picture belongs to, and the key its address sits under (`''` when the element is the address). */
  list: { path: (string | number)[]; srcKey: string } | null;
}

const MAX_SLOTS = 24;
const MAX_DEPTH = 6;

/** Every picture the document carries, in the order it appears. */
export function imageSlots(value: unknown, limit = MAX_SLOTS): ImageSlot[] {
  const out: ImageSlot[] = [];
  walk(value, [], [], out, limit, 0);
  return out;
}

/** One step of the chain: what kind of container holds the node being visited, and where it is. */
type Parent = { kind: 'array' | 'object'; path: (string | number)[] };

function walk(node: unknown, path: (string | number)[], chain: Parent[], out: ImageSlot[], limit: number, depth: number): void {
  if (out.length >= limit || depth > MAX_DEPTH) return;

  if (typeof node === 'string') {
    if (looksLikeImage(node) && path.length > 0) push(out, path, node, chain);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, [...path, index], [...chain, { kind: 'array', path: [...path] }], out, limit, depth + 1));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  for (const [key, inner] of Object.entries(node as Record<string, unknown>)) {
    const here: Parent = { kind: 'object', path: [...path] };
    if (typeof inner === 'string' && IMAGE_KEY.test(key) && looksLikeImage(inner)) {
      push(out, [...path, key], inner, [...chain, here]);
      continue;
    }
    if (inner !== null && typeof inner === 'object') walk(inner, [...path, key], [...chain, here], out, limit, depth + 1);
  }
}

/**
 * Record one address, and the list it belongs to if it belongs to one.
 *
 * A picture is in a gallery when it is the element itself (`['/a.jpg']`) or it is the `src`
 * of an element of one (`[{ src: '/a.webp' }]`, which is how an offer writes both of its
 * languages and what the site's own `OfferImage` type reads). Anything else — a page's single
 * `image`, a list item's `thumb` — is one picture, not a gallery: it can be replaced, but no
 * element is added to or spliced out of a list this console does not own the shape of.
 */
function push(out: ImageSlot[], path: (string | number)[], value: string, chain: Parent[]): void {
  const immediate = chain[chain.length - 1];
  if (!immediate) return;
  let list: ImageSlot['list'] = null;
  if (immediate.kind === 'array') {
    list = { path: [...immediate.path], srcKey: '' };
  } else {
    const grand = chain[chain.length - 2];
    const leaf = String(path[path.length - 1]);
    if (grand && grand.kind === 'array' && GALLERY_KEY.test(leaf)) list = { path: [...grand.path], srcKey: leaf };
  }
  out.push({ key: path.join('.'), path: [...path], src: value.trim(), list });
}

/** The document with one address swapped, along a path this module produced. */
export function writeSlot<T>(root: T, path: readonly (string | number)[], src: string): T {
  return replaceAt(root, path, src) as T;
}

function replaceAt(node: unknown, path: readonly (string | number)[], next: unknown): unknown {
  if (path.length === 0) return next;
  const [head, ...rest] = path as (string | number)[];

  if (Array.isArray(node)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= node.length) return node;
    const copy = [...node];
    copy[index] = replaceAt(copy[index], rest, next);
    return copy;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const key = String(head);
    // A path this module produced always exists; one a caller invented does not, and
    // inventing a key would write a field the site never reads.
    if (!Object.hasOwn(record, key)) return node;
    return { ...record, [key]: replaceAt(record[key], rest, next) };
  }
  return node;
}

/**
 * Add a picture beside the one handed in, shaped like it.
 *
 * A slot that belongs to no list cannot be added to, and the document comes back unchanged:
 * a gallery control only appears where a gallery already exists.
 */
export function appendSlot<T>(root: T, slot: ImageSlot, src: string): T {
  if (!slot.list) return root;
  const current = readAt(root, slot.list.path);
  const element = slot.list.srcKey === '' ? src : { [slot.list.srcKey]: src };
  // A gallery field whose column is NULL is read as `{}` by the console; the list is the
  // document itself, so the first picture replaces that empty object with a one-element
  // array. Only a list this module was explicitly told about reaches this branch.
  if (slot.list.path.length === 0) {
    return (Array.isArray(current) ? [...current, element] : [element]) as T;
  }
  if (!Array.isArray(current)) return root;
  return replaceAt(root, slot.list.path, [...current, element]) as T;
}

/**
 * Take a picture out of a gallery.
 *
 * Only an element of an array is spliced — and for `{ src }` elements it is the whole
 * element, not its `src` key, that goes. A key on a plain object is the document's contract
 * with the reader, so clearing it is left to the single-picture picker, which writes the
 * empty string that column means.
 */
export function removeSlot<T>(root: T, slot: ImageSlot): T {
  const elementPath = slot.list && slot.list.srcKey === '' ? slot.path : slot.list ? slot.path.slice(0, -1) : null;
  if (!elementPath || elementPath.length === 0) return root;
  const parentPath = elementPath.slice(0, -1);
  const index = Number(elementPath[elementPath.length - 1]);
  const parent = readAt(root, parentPath);
  if (!Array.isArray(parent) || !Number.isInteger(index) || index < 0 || index >= parent.length) return root;
  const copy = [...parent];
  copy.splice(index, 1);
  return replaceAt(root, parentPath, copy) as T;
}

function readAt(node: unknown, path: readonly (string | number)[]): unknown {
  let current = node;
  for (const step of path) {
    if (Array.isArray(current) && typeof step === 'number') current = current[step];
    else if (current !== null && typeof current === 'object') current = (current as Record<string, unknown>)[String(step)];
    else return undefined;
  }
  return current;
}

/** The address an upload hands back, as the site stores it. */
export const UPLOAD_PREFIX = '/uploads/';

export function isUploadSrc(src: string): boolean {
  return src.startsWith(UPLOAD_PREFIX);
}

