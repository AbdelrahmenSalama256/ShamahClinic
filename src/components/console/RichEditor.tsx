'use client';

/**
 * The body editor: a person writes, and no tag is ever shown to them.
 *
 * Two fields in this console hold `format: 'html'` — an article's `content` and an offer's
 * `body` — and they are the only content the site prints as markup. Until now both opened as a
 * textarea full of `<p class="wp-block-paragraph">`, which is the owner's complaint almost
 * word for word: *"still cms has HTML tags apear in editors"*. A copy editor is not editing
 * source, and a 234-document corpus of WordPress prose is not going to be retyped.
 *
 * Why a contenteditable surface and not a block list: the corpus has tables, nested lists,
 * figures, `wp-block-*` classes the site's own stylesheets hang off, and 32 tables in documents
 * a person still has to be able to fix. A block model would have to decide what to *do* with all
 * of it, and anything it could not name would be dropped — silent data loss in a text editor is
 * not a trade worth making. Here the document is the model: a table stays a table, the classes
 * ride along untouched, and nobody sees a bracket.
 *
 * Three promises the rest of the row depends on:
 *
 * **What the surface holds is what the site may hold.** Every paste runs through `cleanPaste()`,
 * which reads the same allowlist as the server's `sanitizeRichHtml()`, and the value handed to
 * `onChange` is the surface's own HTML. A `<script>` pasted from an email never becomes text in
 * the field, and never reaches the save either.
 *
 * **A picture is inserted the way every other picture arrives.** The photo button opens the file
 * dialog, the browser compresses, the server answers with an address, and that address is the
 * only thing written into the body — no URL box, in line with the picker (BK-14a.2).
 *
 * **The caret is not a thing this component fights.** The surface is uncontrolled: React never
 * writes into it while the person is typing, and an external change (a locale tab, a reset draft)
 * is applied only when it differs from what is already on screen.
 */
import { useEffect, useRef, useState, type ClipboardEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Alert, Note } from '@/components/ui/Status';
import { Input } from '@/components/ui/Field';
import { cleanPaste } from '@/lib/console/paste-filter';
import { isAllowedHref } from '@/lib/content/rich-policy';
import { mediaMessageKey, uploadPicture } from '@/lib/console/upload';
import type { MessageKey } from '@/lib/console/messages';

export interface RichEditorProps {
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

/** The block-level shapes a clinic body actually uses, as `formatBlock` wants them. */
type Block = 'p' | 'h2' | 'h3' | 'blockquote';

const LINK_SCHEMES = /^(https?:|mailto:|tel:|\/|#)/i;

/**
 * The toolbar as data, at module scope.
 *
 * Not a list of closures built while the component renders: a ref read reached from render —
 * even one tucked into a function handed to a button — is what makes a component update
 * wrongly, and React's own lint rule says so. `press: 'link'` is the one entry that is not a
 * browser command, because a link needs an address before it can be made.
 */
type Tool = { key: MessageKey; press: 'link' } | { key: MessageKey; command: string; argument?: `<${Block}>` };

const TOOLS: readonly Tool[] = [
  { key: 'rich.bold', command: 'bold' },
  { key: 'rich.italic', command: 'italic' },
  { key: 'rich.heading2', command: 'formatBlock', argument: '<h2>' },
  { key: 'rich.heading3', command: 'formatBlock', argument: '<h3>' },
  { key: 'rich.paragraph', command: 'formatBlock', argument: '<p>' },
  { key: 'rich.quote', command: 'formatBlock', argument: '<blockquote>' },
  { key: 'rich.bullets', command: 'insertUnorderedList' },
  { key: 'rich.numbers', command: 'insertOrderedList' },
  { key: 'rich.link', press: 'link' },
  { key: 'rich.unlink', command: 'unlink' },
];

export function RichEditor({ labels, value, onChange, disabled, inputId, title, rtl }: RichEditorProps) {
  const surface = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  // The surface owns its markup. Writing `value` in on every render would re-parse the document
  // under the caret, so it is written only when it is genuinely not what is on screen — a locale
  // tab switch, a discarded draft, a row that just loaded.
  useEffect(() => {
    const el = surface.current;
    if (!el || el.innerHTML === value) return;
    el.innerHTML = cleanPaste(value);
  }, [value]);

  const emit = (): void => {
    const el = surface.current;
    if (el) onChange(el.innerHTML);
  };

  const run = (command: string, argument?: string): void => {
    const el = surface.current;
    if (!el || disabled) return;
    el.focus();
    document.execCommand(command, false, argument);
    emit();
  };

  const openLink = (): void => {
    const el = surface.current;
    if (!el || disabled) return;
    const selected = window.getSelection?.()?.toString() ?? '';
    if (selected === '') {
      setError('rich.link_needs_selection');
      return;
    }
    setError(null);
    setLinkOpen(true);
  };

  const applyLink = (): void => {
    const href = linkHref.trim();
    // The browser is not the authority on an address it is about to wrap words in, but it is the
    // only place a person can be told before the save. The server re-checks the same policy.
    if (!LINK_SCHEMES.test(href) || !isAllowedHref(href)) {
      setError('rich.link_invalid');
      return;
    }
    run('createLink', href);
    setLinkOpen(false);
    setLinkHref('');
  };

  const insertPhoto = (picked: File | null): void => {
    const el = surface.current;
    if (!el || !picked || disabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    void uploadPicture(picked).then((outcome) => {
      if (!outcome.ok) {
        setError(mediaMessageKey(outcome.code));
        return;
      }
      el.focus();
      // Only the address the server returned, and only as an `img` the policy allows.
      document.execCommand('insertHTML', false, `<img src="${outcome.value.src}" alt="" loading="lazy">`);
      emit();
    }).finally(() => {
      setBusy(false);
      if (file.current) file.current.value = '';
    });
  };

  const paste = (event: ClipboardEvent<HTMLDivElement>): void => {
    const el = surface.current;
    if (!el || disabled) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const html = event.clipboardData?.getData('text/html') ?? '';
    event.preventDefault();
    if (html === '') {
      if (text !== '') document.execCommand('insertText', false, text);
      emit();
      return;
    }
    const cleaned = cleanPaste(html);
    // Telling the person what went is the difference between a cleaner and a surprise.
    setNotice(cleaned === html ? null : 'rich.paste_cleaned');
    document.execCommand('insertHTML', false, cleaned);
    emit();
  };

  return (
    <div className="ui-rich" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="ui-rich-toolbar" role="toolbar" aria-label={labels['rich.toolbar']}>
        {TOOLS.map((tool) => (
          <Button
            key={tool.key}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => ('press' in tool ? openLink() : run(tool.command, tool.argument))}
          >
            {labels[tool.key]}
          </Button>
        ))}
        <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => file.current?.click()}>
          {labels['rich.photo']}
        </Button>
      </div>

      {linkOpen ? (
        <div className="ui-rich-link">
          {/* An address is typed nowhere else in this console; a link is the one place a person
              has to, because the site's own pages are not a file anybody uploads. */}
          <Input
            value={linkHref}
            autoFocus
            placeholder="https://…"
            aria-label={labels['rich.link']}
            onChange={(event) => setLinkHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
              if (event.key === 'Escape') setLinkOpen(false);
            }}
          />
          <Button size="sm" variant="primary" onClick={applyLink}>
            {labels['rich.link_apply']}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            {labels['content.cancel']}
          </Button>
        </div>
      ) : null}

      <div
        className="ui-rich-surface"
        id={inputId}
        role="textbox"
        aria-multiline="true"
        aria-label={title}
        data-disabled={disabled || undefined}
        data-placeholder={labels['rich.placeholder']}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={paste}
      />

      <input
        ref={file}
        className="ui-rich-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label={labels['rich.photo']}
        disabled={disabled}
        onChange={(event) => insertPhoto(event.target.files?.[0] ?? null)}
      />

      {error ? <Alert tone="danger">{labels[error]}</Alert> : null}
      {notice ? <Note>{labels[notice]}</Note> : null}
      {busy ? <Note>{labels['media.upload']}</Note> : null}
    </div>
  );
}
