'use client';

/**
 * The pictures a JSON field already holds, as tiles you can click.
 *
 * An offer's `images` is `{ ar: [{ src, alt }], en: [...] }` and the site reads every element
 * of those arrays as one gallery. Before this control the only way to change one was to edit
 * the JSON text and type an address, which is the thing the console no longer does: a picture
 * arrives by choosing a file. So the field is parsed, the addresses are found, and each one
 * gets a frame that uploads into its own place in the document.
 *
 * Three rules the component cannot break:
 *
 * **It renders nothing it cannot write back.** Half-typed JSON is the textarea's complaint to
 * make, and a document with no pictures in it has no list to add to — both cases render no
 * control at all rather than a button that would have to invent a key.
 *
 * **"Add another" is a tile of the list it appends to.** The new element is shaped like the
 * tiles beside it (`image-field.ts` knows whether the address is the element itself or a key
 * on it), and the tile sits at the end of that list, so an Arabic gallery grows inside `ar`
 * and never reaches into `en`.
 *
 * **A remove splices an array element, never an object key.** `{ src }` on a page's single
 * picture is that page's contract with its reader; the picker clears a value and the gallery
 * takes an element out of a list, which are different questions.
 */
import { useMemo, useState, type DragEvent } from 'react';
import { Button } from '@/components/console/kit';
import { Alert } from '@/components/console/kit';
import { appendSlot, imageSlots, removeSlot, writeSlot, type ImageSlot } from '@/lib/console/image-field';
import { mediaMessageKey, uploadPicture } from '@/lib/console/upload';
import type { MessageKey } from '@/lib/console/messages';

interface GalleryProps {
  labels: Record<MessageKey, string>;
  /** The field's raw JSON text, exactly as the editor holds it. */
  value: string;
  /** Called with the re-serialised document, in the two-space shape `formOf` writes. */
  onChange: (next: string) => void;
  disabled: boolean;
  /** The alt text the person has typed, stored with the new file in the library. */
  alt?: { ar: string; en: string };
  /** A gallery tile is square-ish; a banner list is not. */
  ratio?: 'wide' | 'square' | 'tall';
  /** The field's own `id`, carried by the first tile so the row's `<label>` names a real control. */
  inputId?: string;
  /**
   * A gallery that is empty but whose list exists in the document's shape.
   *
   * Without this, an empty gallery renders nothing — which is right for a document this
   * console does not own the shape of, and wrong for an offer's `images`, where the list is
   * the whole field. `path: []` means the document itself is the array.
   */
  empty?: { path: (string | number)[]; srcKey: string } | null;
}

/** Half-typed JSON is not a document: the field's own parser gets to say so, not this control. */
function parse(value: string): unknown {
  const text = value.trim();
  if (text === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed === null || typeof parsed !== 'object' ? undefined : parsed;
  } catch {
    return undefined;
  }
}

export function ImageGallery({ labels, value, onChange, disabled, alt, ratio = 'square', empty = null, inputId }: GalleryProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const root = useMemo(() => parse(value), [value]);
  const slots = useMemo<ImageSlot[]>(() => (root === undefined ? [] : imageSlots(root)), [root]);

  /** The tile an empty gallery grows from: an array element shaped like the ones it will hold. */
  const emptySlot = useMemo<ImageSlot | null>(
    () => (empty ? { key: '__empty', path: [...empty.path, 0], src: '', list: { path: [...empty.path], srcKey: empty.srcKey } } : null),
    [empty],
  );

  const write = (next: unknown): void => onChange(JSON.stringify(next, null, 2));

  async function choose(target: ImageSlot, mode: 'replace' | 'append', file: File | undefined): Promise<void> {
    if (!file || root === undefined || disabled || busyKey !== null) return;
    setBusyKey(target.key);
    setError(null);
    const outcome = await uploadPicture(file, alt ?? { ar: '', en: '' });
    setBusyKey(null);
    if (!outcome.ok) {
      setError(mediaMessageKey(outcome.code));
      return;
    }
    write(mode === 'append' ? appendSlot(root, target, outcome.value.src) : writeSlot(root, target.path, outcome.value.src));
    setBroken((current) => ({ ...current, [target.key]: false }));
  }

  // No document to write into, or no picture in it: a gallery control appears only where a
  // gallery already exists, because anything else would be a guess about the site's shape.
  if (root === undefined) return null;
  if (slots.length === 0 && !emptySlot) return null;

  /** One file input per tile: an upload that could land anywhere in the document would be a guess. */
  function dropHandlers(key: string, target: ImageSlot, mode: 'replace' | 'append') {
    return {
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (disabled || busyKey !== null) return;
        event.preventDefault();
        setDragKey(key);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragKey(null);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragKey(null);
        void choose(target, mode, event.dataTransfer.files?.[0]);
      },
    };
  }

  const listKey = (slot: ImageSlot): string => (slot.list ? slot.list.path.join('.') : '');

  // One flat row of cells: every picture, and after the last picture of each list the tile
  // that adds to it. Built as a list because a grid cannot hold a nested list, and the add
  // tile has to be a sibling of the tiles it belongs to.
  type Cell = { kind: 'slot'; slot: ImageSlot } | { kind: 'add'; slot: ImageSlot };
  const cells: Cell[] = [];
  if (slots.length === 0 && emptySlot) {
    cells.push({ kind: 'add', slot: emptySlot });
  } else {
    slots.forEach((slot, index) => {
      cells.push({ kind: 'slot', slot });
      const next = slots[index + 1];
      if (slot.list !== null && (next === undefined || listKey(next) !== listKey(slot))) cells.push({ kind: 'add', slot });
    });
  }

  return (
    <div className="console-gallery">
      <ul className="console-picker-grid">
        {cells.map((cell, index) => {
          const key = cell.kind === 'add' ? `add-${listKey(cell.slot)}` : cell.slot.key;
          const dragging = dragKey === key;
          const first = index === 0 ? inputId : undefined;
          return (
            <li key={key} className="console-gallery-item">
              {cell.kind === 'add' ? (
                // The add tile is a frame like every other tile, dashed and worded, so the one
                // gesture the person has learned — click the box, choose the file — adds too.
                <div className="console-picker-frame" data-empty="true" data-ratio={ratio} {...dropHandlers(key, cell.slot, 'append')}>
                  <input
                    className="console-picker-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    aria-label={labels['media.add_another']}
                    disabled={disabled || busyKey !== null}
                    id={first}
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      event.target.value = '';
                      void choose(cell.slot, 'append', picked);
                    }}
                  />
                  <span className="console-picker-empty">{labels['media.add_another']}</span>
                  {dragging ? <DropOverlay label={labels['media.drop']} /> : null}
                </div>
              ) : (
                <>
                  <div className="console-picker-frame" data-ratio={ratio} {...dropHandlers(key, cell.slot, 'replace')}>
                    <input
                      className="console-picker-input"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      aria-label={labels['media.replace']}
                      disabled={disabled || busyKey !== null}
                      id={first}
                      onChange={(event) => {
                        const picked = event.target.files?.[0];
                        event.target.value = '';
                        void choose(cell.slot, 'replace', picked);
                      }}
                    />
                    {cell.slot.src !== '' && !broken[cell.slot.key] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cell.slot.src}
                        alt=""
                        loading="lazy"
                        onError={() => setBroken((current) => ({ ...current, [cell.slot.key]: true }))}
                      />
                    ) : (
                      <span className="console-picker-empty">{broken[cell.slot.key] ? labels['media.broken'] : labels['media.empty']}</span>
                    )}
                    {dragging ? <DropOverlay label={labels['media.drop']} /> : null}
                  </div>

                  {cell.slot.list ? (
                    <div className="console-gallery-actions">
                      <Button size="sm" variant="ghost" disabled={disabled || busyKey !== null} onClick={() => write(removeSlot(root, cell.slot))}>
                        {labels['media.remove_one']}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <Alert tone="danger" role="alert">
          {labels[error]}
        </Alert>
      ) : null}
    </div>
  );
}

function DropOverlay({ label }: { label: string }) {
  return (
    <span
      className="console-picker-empty"
      style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--c-surface-soft)', opacity: 0.94 }}
    >
      {label}
    </span>
  );
}
