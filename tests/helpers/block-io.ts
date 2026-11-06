/**
 * The console's body round trip, performed in Node.
 *
 * The editor is a browser thing: TipTap builds a document by handing stored HTML to ProseMirror's
 * DOM parser, and saving means serializing that document back. A test that only reads the stored
 * string proves nothing about that pair, and a test that needs a browser cannot run in this
 * project's suite (vitest is `environment: 'node'`, and the suite shares one fork with the
 * database tests). So this module rebuilds the same two steps from the same schema —
 * `blockExtensions` — over a jsdom document, which is the smallest thing that can honestly be
 * called "opened in the editor and saved".
 *
 * It is a test helper and lives in `tests/` for that reason: nothing under `src/` may import
 * `jsdom`, since `cpanel-upload/` — the tree the server builds — does not carry it, and `next
 * build` type-checks every file it ships.
 */
import { getSchema } from '@tiptap/core';
import { DOMParser, DOMSerializer, Node as ProseNode, type Schema } from '@tiptap/pm/model';
import { JSDOM } from 'jsdom';

import { blockExtensions } from '@/lib/content/block-schema';
import { closeBody, openBody } from '@/lib/content/block-html';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { document } = dom.window;

const schema: Schema = getSchema(blockExtensions);

export type BlockDoc = ProseNode;

/** Stored body → the document the surface would show. */
export function htmlToBlocks(html: string): BlockDoc {
  const holder = document.createElement('div');
  holder.innerHTML = openBody(html);
  return DOMParser.fromSchema(schema).parse(holder, { preserveWhitespace: false });
}

/** Document → the string that goes into `content_ar`. */
export function blocksToHtml(doc: BlockDoc): string {
  const holder = document.createElement('div');
  DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document: document as never }, holder);
  return closeBody(holder.innerHTML);
}

/** The whole trip, both directions. */
export function roundTrip(html: string): string {
  return blocksToHtml(htmlToBlocks(html));
}

/** The document after one trip, for comparing structure rather than markup. */
export function blocksOf(html: string): BlockDoc {
  return htmlToBlocks(html);
}

export { schema };
