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
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Status';
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

export function ImageGallery({ labels, value, onChange, disabled, alt, ratio = 'square' }: GalleryProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const root = useMemo(() => parse(value), [value]);
  const slots = useMemo<ImageSlot[]>(() => (root === undefined ? [] : imageSlots(root)), [root]);

  const write = (next: unknown): void => onChange(JSON.stringify(next, null, 2));

  async function choose(target: ImageSlot, mode: 'replace' | 'append', file: File | undefined): Promise<void> {
    if (!file || root === undefined) return;
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
  if (root === undefined || slots.length === 0) return null;

  const listKey = (slot: ImageSlot): string => (slot.list ? slot.list.path.join('.') : '');

  // One flat row of cells: every picture, and after the last picture of each list the tile
  // that adds to it. Built as a list because a grid cannot hold a nested list, and the add
  // tile has to be a sibling of the tiles it belongs to.
  type Cell = { kind: 'slot'; slot: ImageSlot } | { kind: 'add'; slot: ImageSlot };
  const cells: Cell[] = [];
  slots.forEach((slot, index) => {
    cells.push({ kind: 'slot', slot });
    const next = slots[index + 1];
    if (slot.list !== null && (next === undefined || listKey(next) !== listKey(slot))) cells.push({ kind: 'add', slot });
  });

  return (
    <div className="ui-gallery">
      <ul className="ui-picker-grid">
        {cells.map((cell) =>
          cell.kind === 'add' ? (
            // The add tile is a frame like every other tile, dashed and worded, so the one
            // gesture the person has learned — click the box, choose the file — adds too.
            <li key={`add-${listKey(cell.slot)}`} className="ui-gallery-item">
              <div className="ui-picker-frame" data-empty="true" data-ratio={ratio}>
                <input
                  className="ui-picker-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label={labels['media.add_another']}
                  disabled={disabled || busyKey !== null}
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    event.target.value = '';
                    void choose(cell.slot, 'append', picked);
                  }}
                />
                <span className="ui-picker-empty">{labels['media.add_another']}</span>
              </div>
            </li>
          ) : (
            <li key={cell.slot.key} className="ui-gallery-item">
              {/* One file input per tile: an upload that could land anywhere in the document
                  would be a guess, and a gallery is exactly where the address has to be right. */}
              <div className="ui-picker-frame" data-ratio={ratio}>
                <input
                  className="ui-picker-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label={labels['media.replace']}
                  disabled={disabled || busyKey !== null}
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
                  <span className="ui-picker-empty">{broken[cell.slot.key] ? labels['media.broken'] : labels['media.empty']}</span>
                )}
              </div>

              {cell.slot.list ? (
                <div className="ui-gallery-actions">
                  <Button size="sm" variant="ghost" disabled={disabled || busyKey !== null} onClick={() => write(removeSlot(root, cell.slot))}>
                    {labels['media.remove_one']}
                  </Button>
                </div>
              ) : null}
            </li>
          )
        )}
      </ul>

      {error ? (
        <Alert tone="danger" role="alert">
          {labels[error]}
        </Alert>
      ) : null}
    </div>
  );
}
