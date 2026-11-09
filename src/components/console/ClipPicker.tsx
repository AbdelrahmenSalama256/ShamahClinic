'use client';

/**
 * The control that puts a voice note or a video on the site — `ImagePicker`'s sibling.
 *
 * Same promises: the field only ever holds an address the server answered with, a failed
 * upload leaves the old value in place, and the reason is a sentence under the button. What
 * differs is the preview: a player the editor can press, so she hears the voice note she is
 * about to publish rather than trusting a file name.
 */
import { useRef, useState } from 'react';
import { Alert, Button, Note } from '@/components/console/kit';
import { consoleUpload } from './client-api';
import { formatBytes } from '@/lib/console/compress';
import { mediaMessageKey } from '@/lib/console/upload';
import type { MessageKey } from '@/lib/console/messages';

export interface ClipPickerProps {
  labels: Record<MessageKey, string>;
  accept: 'audio' | 'video';
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  inputId: string;
}

const ACCEPT = {
  audio: 'audio/*,.opus,.ogg,.m4a,.mp3,.wav',
  video: 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov',
} as const;

function clipMessageKey(code: string): MessageKey {
  if (code === 'too_large') return 'clip.error.too_large';
  if (code === 'not_audio' || code === 'not_video' || code === 'invalid_input') return 'clip.error.format';
  return mediaMessageKey(code);
}

export function ClipPicker({ labels, accept, value, onChange, disabled, inputId }: ClipPickerProps) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const has = value.trim() !== '';

  async function choose(selected: File | undefined): Promise<void> {
    if (!selected || disabled || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set('file', selected);
    form.set('kind', accept);
    const res = await consoleUpload<{ media?: { src?: unknown } }>('/api/console/media/clip', form);
    setBusy(false);
    const src = res.data?.media?.src;
    if (res.error || typeof src !== 'string' || !src) {
      setError(clipMessageKey(res.error ?? 'no_address'));
      return;
    }
    setSent(selected.size);
    onChange(src);
  }

  return (
    <div className="console-picker console-clip" data-kind={accept}>
      <div
        className="console-clip-frame"
        data-empty={!has}
        data-dragging={drag || undefined}
        onDragOver={(event) => {
          if (disabled || busy) return;
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          void choose(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          id={inputId}
          ref={file}
          className="console-picker-input"
          type="file"
          accept={ACCEPT[accept]}
          disabled={disabled || busy}
          // A player sits on top when there is a file; the input must not swallow its clicks.
          style={has ? { pointerEvents: 'none' } : undefined}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            void choose(picked);
          }}
        />
        {has ? (
          accept === 'audio' ? (
            <audio src={value} controls preload="metadata" />
          ) : (
            <video src={value} controls preload="metadata" playsInline />
          )
        ) : (
          <span className="console-picker-empty">{drag ? labels['media.drop'] : labels[accept === 'audio' ? 'clip.empty.audio' : 'clip.empty.video']}</span>
        )}
      </div>

      <div className="console-picker-actions">
        <Button type="button" size="sm" disabled={disabled || busy} loading={busy} onClick={() => file.current?.click()}>
          {has ? labels['clip.replace'] : labels[accept === 'audio' ? 'clip.upload.audio' : 'clip.upload.video']}
        </Button>
        {has ? (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => { onChange(''); setSent(null); }}>
            {labels['clip.clear']}
          </Button>
        ) : null}
      </div>

      {sent !== null ? <Note tone="ok">{formatBytes(sent)}</Note> : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {labels[error]}
        </Alert>
      ) : null}
    </div>
  );
}
