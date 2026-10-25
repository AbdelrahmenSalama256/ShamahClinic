'use client';

/**
 * The one control that puts a picture on the site.
 *
 * It replaced a text box. That is the whole reason it exists: a path a person types is a
 * broken image waiting to happen, and it is also how an address that points somewhere the
 * site should not fetch gets served to a client's browser. Here a picture arrives by choosing
 * a file, the browser shrinks it, the server stores the bytes and hands back the address, and
 * that address is what the field holds. Nobody types one.
 *
 * Three things the call sites depend on:
 *
 * **It never invents a value.** The address written into the field is the one the server
 * returned, so every picture the console adds lives under `/uploads/` and is a file the
 * database has a row for.
 *
 * **The old value survives until the new one is real.** A failed upload leaves the field
 * exactly as it was, with the reason under the button — a picture is not half-replaced.
 *
 * **A value the site already had is not destroyed.** Content imported from WordPress points at
 * `/wp/…` paths and the frozen snapshot has to keep rendering. Those stay readable in the
 * preview and stay what gets saved until a person chooses a file, which is when they are
 * swapped for an upload.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/console/kit';
import { Alert, Empty, Note, Skeleton } from '@/components/console/kit';
import { consoleRead } from './client-api';
import { formatBytes } from '@/lib/console/compress';
import { looksLikeImage } from '@/lib/console/image-field';
import { mediaMessageKey, uploadPicture } from '@/lib/console/upload';
import type { MessageKey } from '@/lib/console/messages';

interface MediaItem {
  id: string;
  src: string;
  filename: string;
  bytes: number;
  width: number;
  height: number;
}

interface MediaList {
  items?: MediaItem[];
}

/** Everything a picture can arrive as: a click on this control, plus what the field already holds. */
export interface ImagePickerProps {
  labels: Record<MessageKey, string>;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  /** The field's own `id`, so the `<label>` the row renders still points at a real control. */
  inputId: string;
  /** The alt text the person has typed for this picture, stored with it in the library. */
  alt?: { ar: string; en: string };
  /** A banner frame is wide and a doctor's portrait is not; the box keeps the shape it fills. */
  ratio?: 'wide' | 'square' | 'tall';
}

export function ImagePicker({ labels, value, onChange, disabled, inputId, alt, ratio = 'wide' }: ImagePickerProps) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [result, setResult] = useState<{ from: number; to: number; width: number; height: number } | null>(null);
  const [broken, setBroken] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [opening, setOpening] = useState(false);

  const hasPicture = value.trim() !== '' && looksLikeImage(value);

  async function choose(selected: File | undefined): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const outcome = await uploadPicture(selected, alt ?? { ar: '', en: '' });
    setBusy(false);
    if (!outcome.ok) {
      setError(mediaMessageKey(outcome.code));
      return;
    }
    setResult({ from: outcome.value.from.bytes, to: outcome.value.to.bytes, width: outcome.value.to.width, height: outcome.value.to.height });
    setBroken(false);
    // The address comes from the server, never from the file name the browser reported.
    onChange(outcome.value.src);
    if (file.current) file.current.value = '';
  }

  async function openLibrary(): Promise<void> {
    if (items || opening) return;
    setOpening(true);
    const res = await consoleRead<MediaList>('/api/console/media?limit=24');
    setOpening(false);
    if (res.error) setError(mediaMessageKey(res.error));
    else setItems(res.data?.items ?? []);
  }

  return (
    <div className="console-picker">
      <div className="console-picker-frame" data-empty={!hasPicture} data-ratio={ratio}>
        {/* The input is the control the row's `<label>` names, stretched invisibly over the
            frame: a click anywhere on the picture opens the file dialog, and the focus ring
            stays the global one because the element that takes it still draws. */}
        <input
          id={inputId}
          ref={file}
          className="console-picker-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={disabled || busy}
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        {hasPicture && !broken ? (
          // The address may be a `/wp` path from the import or a `/uploads` one from this
          // control; neither is a host `next/image` is configured for, so the frame is plain.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className="console-picker-empty">{broken ? labels['media.broken'] : labels['media.empty']}</span>
        )}
      </div>

      <div className="console-picker-actions">
        {/* The label is the field's own, and the control it points at is the file input a
            button opens: an upload is a control, so it gets a visible name. */}
        <Button type="button" size="sm" disabled={disabled || busy} loading={busy} onClick={() => file.current?.click()}>
          {hasPicture ? labels['media.replace'] : labels['media.upload']}
        </Button>
        {hasPicture ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => {
              onChange('');
              setResult(null);
              setBroken(false);
            }}
          >
            {labels['media.clear']}
          </Button>
        ) : null}
      </div>

      {result ? (
        <Note tone="ok">
          {labels['media.compressed']} {formatBytes(result.from)} → {formatBytes(result.to)} · {result.width}×{result.height}
        </Note>
      ) : (
        <Note>{labels['media.compress_hint']}</Note>
      )}

      {error ? (
        <Alert tone="danger" role="alert">
          {labels[error]}
        </Alert>
      ) : null}

      {/* A disclosure, not a dialog: the console's chrome has to work with script off, and a
          second modal on this screen would fight the one the row's unsaved-changes gate owns. */}
      <details className="console-picker-library" onToggle={(event) => (event.target as HTMLDetailsElement).open && void openLibrary()}>
        <summary>{labels['media.library']}</summary>
        {opening ? <Skeleton rows={2} label={labels['media.library']} /> : null}
        {items && items.length === 0 ? <Empty>{labels['media.library_empty']}</Empty> : null}
        {items && items.length > 0 ? (
          <ul className="console-picker-grid">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="console-picker-tile"
                  data-active={item.src === value}
                  disabled={disabled}
                  onClick={() => {
                    setBroken(false);
                    setResult(null);
                    onChange(item.src);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt="" loading="lazy" width={120} height={90} />
                  <span className="console-picker-tile-meta">
                    <bdi>{item.filename}</bdi>
                    <Note>
                      {item.width}×{item.height} · {formatBytes(item.bytes)}
                    </Note>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}
