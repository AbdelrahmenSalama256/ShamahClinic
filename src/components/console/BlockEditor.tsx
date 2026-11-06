'use client';

/**
 * The body editor: a page a person writes on, with the blocks the site can print.
 *
 * This replaced a contenteditable box driven by `document.execCommand` (#246).
 * That was the right first answer to *"still cms has HTML tags apear in editors"* — nobody typed a
 * bracket again — but it could not answer the second half of the brief: a FAQ pair and a
 * call-to-action box are not things `execCommand` can make, an image arrived with no alt text and
 * no way to give it one, and a table could be pasted in but never edited.
 *
 * What carries over is the reason the old one existed: **the document is the model.** The corpus is
 * 94 WordPress articles full of tables, nested lists and classes, and anything a block model could
 * not name it would drop. Here the schema in `@/lib/content/block-schema` names what the corpus
 * holds — measured, with the counts in its header — and the two string passes in
 * `@/lib/content/block-html` make the editor's document and the database column agree, so opening
 * an article, changing one sentence and saving costs nothing else.
 *
 * Four promises the rest of the row depends on:
 *
 * **The surface is the schema.** Not a decoration on top of a textarea: the document model *is*
 * TipTap's, so what a person can insert is exactly what the round trip proved it can carry, and the
 * HTML handed to `onChange` is serialized by the same `renderHTML` specs the server's tests emit.
 *
 * **A paste costs styling, not words.** `cleanPaste()` reads the same allowlist as the server's
 * `sanitizeRichHtml()`, and the person is told when it removed something.
 *
 * **A picture comes from the library.** The photo control uploads through the browser's own
 * compressor or picks an existing file, and always carries an alt text — which is a property of the
 * picture, not of the paragraph it lands in, so it is asked for in the same breath as the choice.
 *
 * **The caret is not a thing this component fights.** React never writes into the document while a
 * person types. An external change (a locale tab, a discarded draft, a reset) is applied only when
 * the string it brings is not the one this surface just produced.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type Editor, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { Placeholder } from '@tiptap/extensions';

import { Alert, Button, Chip, ChipRow, Empty, Input, Note, Skeleton } from '@/components/console/kit';
import { consoleRead } from './client-api';
import { cleanPaste } from '@/lib/console/paste-filter';
import { mediaMessageKey, uploadPicture } from '@/lib/console/upload';
import type { MessageKey } from '@/lib/console/messages';
import { CTA_VARIANTS, type CtaVariant } from '@/lib/content/block-contract';
import { closeBody, openBody } from '@/lib/content/block-html';
import { CtaBlock, blockExtensions } from '@/lib/content/block-schema';
import { isAllowedHref } from '@/lib/content/rich-policy';

export interface BlockEditorProps {
  labels: Record<MessageKey, string>;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** The field's own `id`: the surface is the control the row is about, so it carries it. */
  inputId: string;
  /** The row's label, which is the accessible name a contenteditable surface cannot get from a `<label>`. */
  title: string;
  /** Which language the person is writing in, so the surface reads in the right direction. */
  rtl: boolean;
}

interface MediaItem {
  id: string;
  src: string;
  filename: string;
  bytes: number;
  width: number;
  height: number;
  alt?: { ar: string; en: string };
}

interface MediaList {
  items?: MediaItem[];
}

const LINK_SCHEMES = /^(https?:|mailto:|tel:|\/|#)/i;

/** What the toolbar has to know about the caret, and nothing else. */
interface Snapshot {
  bold: boolean;
  italic: boolean;
  paragraph: boolean;
  heading2: boolean;
  heading3: boolean;
  bullet: boolean;
  numbered: boolean;
  quote: boolean;
  link: boolean;
  table: boolean;
  image: { src: string; alt: string } | null;
  undo: boolean;
  redo: boolean;
}

const BLANK: Snapshot = {
  bold: false, italic: false, paragraph: true, heading2: false, heading3: false, bullet: false,
  numbered: false, quote: false, link: false, table: false, image: null, undo: false, redo: false,
};

function snapshotOf(editor: Editor): Snapshot {
  const attributes = editor.getAttributes('image');
  const src = typeof attributes.src === 'string' ? attributes.src : '';
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    paragraph: editor.isActive('paragraph'),
    heading2: editor.isActive('heading', { level: 2 }),
    heading3: editor.isActive('heading', { level: 3 }),
    bullet: editor.isActive('bulletList'),
    numbered: editor.isActive('orderedList'),
    quote: editor.isActive('blockquote'),
    link: editor.isActive('link'),
    table: editor.isActive('table'),
    image: editor.isActive('image') && src !== '' ? { src, alt: String(attributes.alt ?? '') } : null,
    undo: editor.can().undo(),
    redo: editor.can().redo(),
  };
}

/**
 * The console's words, handed to the node views without a ref read during render.
 *
 * A node view is rendered by `EditorContent`, inside this component's tree, so a provider here is
 * the one place the catalog can come from without a module-scope copy of a language. Partial
 * because the default is empty: outside this provider a node view has no words, which is a
 * rendering bug and not a thing to hide behind a fallback language.
 */
const Strings = createContext<Partial<Record<MessageKey, string>>>({});

/** The call-to-action chip a body holds in place of the box the page will print. */
function CtaView({ node, editor, selected, updateAttributes }: NodeViewProps): ReactNode {
  const strings = useContext(Strings);
  const word = (key: MessageKey): string => strings[key] ?? '';
  const variant = String(node.attrs.variant) as CtaVariant;
  return (
    <NodeViewWrapper as="div" className="console-block-cta" data-selected={selected || undefined}>
      <span className="console-block-cta-title">{word('rich.cta')}</span>
      <ChipRow label={word('rich.cta')}>
        {CTA_VARIANTS.map((option) => (
          <Chip
            key={option}
            active={option === variant}
            disabled={!editor.isEditable}
            onClick={() => updateAttributes({ variant: option })}
          >
            {word(`rich.cta_${option}` as MessageKey)}
          </Chip>
        ))}
      </ChipRow>
      <Note>{word('rich.cta_hint')}</Note>
    </NodeViewWrapper>
  );
}

/**
 * The document model, with the console's face on one node.
 *
 * Built once, at module scope: it holds no words and no field identity, so nothing about a
 * person's row can make it stale — and a surface rebuilt on a render the person did not ask for
 * is a caret sent back to the start of the document.
 *
 * `getHTML()` does not look at a node view, so what is stored is the `renderHTML` the round trip
 * proved, and the view is only how the chip looks while it is being written.
 */
const EXTENSIONS = [
  ...blockExtensions.filter((entry) => entry.name !== 'ctaBlock'),
  CtaBlock.extend({ addNodeView: () => ReactNodeViewRenderer(CtaView) }),
  // Every empty slot at once, so a FAQ pair reads as two named boxes before a person has clicked
  // either. Which slot a hint belongs to is a property of the document, and the words themselves
  // belong to a language — so the extension supplies the `is-empty` classes, the sheet supplies
  // the sentences, and `--rich-*` below carries them from the catalog on every render.
  Placeholder.configure({ includeChildren: true, showOnlyCurrent: false, placeholder: '' }),
];

/** A catalog sentence, as a CSS string token — quotes and all, since it is going into `content`. */
const asCssString = (text: string): string => JSON.stringify(text);

export function BlockEditor({ labels, value, onChange, disabled, inputId, title, rtl }: BlockEditorProps) {
  const file = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<'link' | 'image' | null>(null);
  const [href, setHref] = useState('');
  const [altDraft, setAltDraft] = useState('');
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [snap, setSnap] = useState<Snapshot>(BLANK);
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  /** The HTML this surface last handed up, or was handed. A string, because that is what the row holds. */
  const pending = useRef(value);

  const editor = useEditor(
    {
      extensions: EXTENSIONS,
      content: () => cleanPaste(openBody(value)),
      immediatelyRender: false,
      editable: !disabled,
      onUpdate: ({ editor: ed }) => {
        const html = closeBody(ed.getHTML());
        pending.current = html;
        onChange(html);
      },
      editorProps: {
        // The row's identity and accessible name travel with the field, so they are set here and
        // re-applied by TipTap on every render (`Editor.setOptions` → `view.setProps`) rather than
        // written onto the DOM by this component.
        attributes: {
          class: 'console-block-surface',
          id: inputId,
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': title,
        },
        // A paste is cleaned here, not after the browser has already put its own markup in the
        // document: what a person keeps typing into must be what may be saved.
        handlePaste: (view, event) => {
          const html = event.clipboardData?.getData('text/html') ?? '';
          if (html === '') return false; // plain text is prose; ProseMirror wraps it correctly.
          event.preventDefault();
          const cleaned = cleanPaste(html);
          setNotice(cleaned === html ? null : 'rich.paste_cleaned');
          const words = cleaned.replace(/<[^>]*>/g, '').trim();
          view.pasteHTML(words === '' ? (event.clipboardData?.getData('text/plain') ?? '') : cleaned);
          return true;
        },
        // A picture dropped on the page is the same gesture as one chosen from the dialog.
        handleDrop: (_view, event) => {
          const picked = event.dataTransfer?.files?.[0];
          if (!picked || !picked.type.startsWith('image/')) return false;
          event.preventDefault();
          void uploadAndPlace(picked);
          return true;
        },
        // A click on a picture opens the control that can name it; a caret beside it cannot.
        handleClickOn: (view, pos, node) => {
          if (node.type.name !== 'image') return false;
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
          setAltDraft(String(node.attrs.alt ?? ''));
          setPanel('image');
          return true;
        },
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    const read = (): void => setSnap(snapshotOf(editor));
    read();
    editor.on('transaction', read);
    return () => {
      editor.off('transaction', read);
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  // An external change is a different document, not a different spelling of this one. The string
  // this surface produced is remembered so the row echoing it back cannot re-parse the page.
  useEffect(() => {
    if (!editor || value === pending.current) return;
    const html = cleanPaste(openBody(value));
    pending.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
    setSnap(snapshotOf(editor));
  }, [editor, value]);

  /** Put a picture in the body — or into the one already chosen — at the address the server gave. */
  function place(src: string, alt: string): void {
    const ed = editor;
    if (!ed || disabled) return;
    const chain = ed.chain().focus();
    if (ed.isActive('image')) chain.updateAttributes('image', { src, alt });
    else chain.setImage({ src, alt });
    chain.run();
    setPanel(null);
  }

  async function uploadAndPlace(picked: File | null | undefined): Promise<void> {
    if (!picked || !editor || disabled) return;
    // The words the person typed into the alt box, in the language this field is written in.
    const alt = altDraft;
    setBusy(true);
    setError(null);
    const outcome = await uploadPicture(picked, rtl ? { ar: alt, en: '' } : { ar: '', en: alt });
    setBusy(false);
    if (file.current) file.current.value = '';
    if (!outcome.ok) {
      setError(mediaMessageKey(outcome.code));
      return;
    }
    place(outcome.value.src, alt);
  }

  async function openLibrary(): Promise<void> {
    if (items || !editor) return;
    setBusy(true);
    const res = await consoleRead<MediaList>('/api/console/media?limit=24');
    setBusy(false);
    if (res.error) setError(mediaMessageKey(res.error));
    else setItems(res.data?.items ?? []);
  }

  function writeAlt(next: string): void {
    setAltDraft(next);
    editor?.chain().updateAttributes('image', { alt: next }).run();
  }

  function applyLink(): void {
    const ed = editor;
    const target = href.trim();
    if (!ed || disabled) return;
    // The browser is not the authority on an address it is about to wrap words in, but it is the
    // only place a person can be told before the save. The server re-checks the same policy.
    if (target !== '' && (!LINK_SCHEMES.test(target) || !isAllowedHref(target))) {
      setError('rich.link_invalid');
      return;
    }
    const chain = ed.chain().focus().extendMarkRange('link');
    if (target === '') chain.unsetLink();
    else chain.setLink({ href: target });
    chain.run();
    setPanel(null);
    setHref('');
    setError(null);
  }

  function askForLink(): void {
    if (!editor || disabled) return;
    setError(null);
    if (editor.isActive('link')) setHref(String(editor.getAttributes('link').href ?? ''));
    else if (editor.state.selection.empty) {
      setError('rich.link_needs_selection');
      return;
    } else setHref('');
    setPanel('link');
  }

  function insert(kind: 'faq' | 'cta' | 'table' | 'rule'): void {
    const ed = editor;
    if (!ed || disabled) return;
    const chain = ed.chain().focus();
    if (kind === 'faq') {
      chain.insertContent({
        type: 'faqItem',
        content: [{ type: 'faqQuestion' }, { type: 'faqAnswer', content: [{ type: 'paragraph' }] }],
      });
    } else if (kind === 'cta') chain.insertContent({ type: 'ctaBlock', attrs: { variant: CTA_VARIANTS[0] } });
    else if (kind === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
    else chain.setHorizontalRule();
    chain.run();
  }

  const tool = (key: MessageKey, run: () => void, active = false, off = disabled): ReactNode => (
    <Button size="sm" variant={active ? 'primary' : 'ghost'} disabled={off} onClick={run}>
      {labels[key]}
    </Button>
  );

  return (
    <Strings.Provider value={labels}>
      <div
        className="console-block-editor"
        dir={rtl ? 'rtl' : 'ltr'}
        data-disabled={disabled || undefined}
        style={{
          '--c-rich-placeholder': asCssString(labels['rich.placeholder']),
          '--c-rich-faq-question': asCssString(labels['rich.faq_question']),
          '--c-rich-faq-answer': asCssString(labels['rich.faq_answer']),
        } as CSSProperties}
      >
        <div className="console-block-toolbar" role="toolbar" aria-label={labels['rich.toolbar']}>
          {tool('rich.undo', () => editor?.chain().focus().undo().run(), false, disabled || !snap.undo)}
          {tool('rich.redo', () => editor?.chain().focus().redo().run(), false, disabled || !snap.redo)}
          {tool('rich.paragraph', () => editor?.chain().focus().setParagraph().run(), snap.paragraph)}
          {tool('rich.heading2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), snap.heading2)}
          {tool('rich.heading3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), snap.heading3)}
          {tool('rich.bold', () => editor?.chain().focus().toggleMark('bold').run(), snap.bold)}
          {tool('rich.italic', () => editor?.chain().focus().toggleMark('italic').run(), snap.italic)}
          {tool('rich.bullets', () => editor?.chain().focus().toggleBulletList().run(), snap.bullet)}
          {tool('rich.numbers', () => editor?.chain().focus().toggleOrderedList().run(), snap.numbered)}
          {tool('rich.quote', () => editor?.chain().focus().toggleBlockquote().run(), snap.quote)}
          {tool('rich.link', askForLink, snap.link)}
          {tool('rich.unlink', () => editor?.chain().focus().extendMarkRange('link').unsetLink().run(), false, disabled || !snap.link)}
          {tool('rich.table', () => insert('table'), snap.table)}
          {tool('rich.photo', () => {
            setAltDraft(snap.image?.alt ?? '');
            setPanel('image');
            void openLibrary();
          })}
          {tool('rich.faq', () => insert('faq'))}
          {tool('rich.cta', () => insert('cta'))}
          {tool('rich.divider', () => insert('rule'))}
        </div>

        {snap.table ? (
          <div className="console-block-toolbar console-block-table-tools" role="group" aria-label={labels['rich.table']}>
            {tool('rich.row_after', () => editor?.chain().focus().addRowAfter().run())}
            {tool('rich.col_after', () => editor?.chain().focus().addColumnAfter().run())}
            {tool('rich.header_toggle', () => editor?.chain().focus().toggleHeaderRow().run())}
            {tool('rich.row_delete', () => editor?.chain().focus().deleteRow().run())}
            {tool('rich.col_delete', () => editor?.chain().focus().deleteColumn().run())}
            {tool('rich.table_delete', () => editor?.chain().focus().deleteTable().run())}
          </div>
        ) : null}

        {panel === 'link' ? (
          <div className="console-block-link">
            {/* An address is typed nowhere else in this console; a link is the one place a person
                has to, because the site's own pages are not a file anybody uploads. */}
            <Input
              value={href}
              autoFocus
              placeholder="https://…"
              aria-label={labels['rich.link']}
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }
                if (event.key === 'Escape') setPanel(null);
              }}
            />
            <Button size="sm" variant="primary" onClick={applyLink}>
              {labels['rich.link_apply']}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              {labels['content.cancel']}
            </Button>
          </div>
        ) : null}

        {panel === 'image' ? (
          <div className="console-block-image">
            <Input
              value={altDraft}
              autoFocus
              aria-label={labels['rich.image_alt']}
              placeholder={labels['rich.image_alt']}
              onChange={(event) => writeAlt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setPanel(null);
              }}
            />
            {altDraft.trim() === '' ? <Note tone="warn">{labels['rich.image_alt_missing']}</Note> : null}
            <div className="console-block-image-actions">
              <Button size="sm" disabled={busy} loading={busy} onClick={() => file.current?.click()}>
                {labels['rich.image_upload']}
              </Button>
              {snap.image ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    editor?.chain().focus().deleteSelection().run();
                    setPanel(null);
                  }}
                >
                  {labels['rich.image_remove']}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                {labels['content.cancel']}
              </Button>
            </div>
            {items && items.length === 0 ? <Empty>{labels['media.library_empty']}</Empty> : null}
            {items && items.length > 0 ? (
              <ul className="console-picker-grid">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="console-picker-tile"
                      data-active={item.src === snap.image?.src}
                      disabled={disabled}
                      onClick={() => {
                        const alt = (rtl ? item.alt?.ar : item.alt?.en) ?? '';
                        setAltDraft(alt);
                        place(item.src, alt !== '' ? alt : altDraft);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.src} alt="" loading="lazy" width={120} height={90} />
                      <span className="console-picker-tile-meta">
                        <bdi>{item.filename}</bdi>
                        <Note>{(rtl ? item.alt?.ar : item.alt?.en) ?? ''}</Note>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {busy && !items ? <Skeleton rows={2} label={labels['media.library']} /> : null}
          </div>
        ) : null}

        <EditorContent editor={editor} />

        <input
          ref={file}
          className="console-block-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          aria-label={labels['rich.photo']}
          disabled={disabled}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            void uploadAndPlace(picked);
          }}
        />

        {error ? <Alert tone="danger">{labels[error]}</Alert> : null}
        {notice ? <Note>{labels[notice]}</Note> : null}
      </div>
    </Strings.Provider>
  );
}
