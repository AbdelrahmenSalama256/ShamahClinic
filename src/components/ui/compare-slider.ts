'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * The drag-to-compare interaction, with no paint in it.
 *
 * Two surfaces need the same behaviour — the home page's band and the console's preview of
 * the row being edited — and they may not share a stylesheet: the console document has its
 * own token layer, and a rule from one reaching the other is a bug this repository has
 * already been asked to prevent. So the *logic* lives here, once, and each surface writes
 * its own markup around `frameProps` and `handleProps`.
 *
 * What lives here is the part that is easy to get wrong twice:
 *
 * **Direction.** `progress` is always "how much of the before picture is showing", counted
 * from the side the reader starts on. In an Arabic page that side is the right, so the clip
 * is measured from 100% inwards and the handle is pinned by its own right edge — otherwise
 * the handle travels one way while the sentence it illustrates travels the other, and the
 * arrow keys lie about what they do.
 *
 * **Pointer and keyboard on one control.** A press anywhere in the frame jumps the divide
 * there and hands focus to the handle, so a drag that starts on the photograph still ends
 * with something a keyboard can carry on from. `touch-pan-y` is set by the caller: a frame
 * that swallowed every vertical gesture would lock a phone reader inside the comparison.
 */

/** How far one key press moves the divide, in percent of the frame's width. */
const STEP = 4;
const BIG_STEP = 20;

const clampProgress = (value: number): number => Math.min(100, Math.max(0, value));

/** The three positions the frame draws, for one value of `progress` in one reading direction. */
export function frameGeometry(progress: number, rtl: boolean): {
  clipPath: string;
  handle: React.CSSProperties;
  line: React.CSSProperties;
} {
  const edge = rtl ? 100 - progress : progress;
  return {
    clipPath: rtl
      ? `polygon(100% 0%, ${edge}% 0%, ${edge}% 100%, 100% 100%)`
      : `polygon(0% 0%, ${edge}% 0%, ${edge}% 100%, 0% 100%)`,
    handle: rtl
      ? { right: `${progress}%`, transform: 'translate(50%, -50%)' }
      : { left: `${progress}%`, transform: 'translate(-50%, -50%)' },
    line: rtl ? { right: `${progress}%` } : { left: `${progress}%` },
  };
}

export interface CompareSlider {
  /** share of the before picture still on screen, 0–100 */
  progress: number;
  /** the same value as a screen reader should be told it */
  percent: number;
  /** ref, the pointer gestures and the class that keeps a touch scroll alive */
  frameProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    className: string;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  /** the keyboard, plus the value an `aria-valuenow` reads; the caller names the control */
  handleProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    role: 'slider';
    tabIndex: number;
    'aria-valuemin': number;
    'aria-valuemax': number;
    'aria-orientation': 'horizontal';
    'aria-valuenow': number;
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  };
  /** back to the middle, which is what a new case deserves */
  reset: () => void;
}

export function useCompareSlider(rtl: boolean): CompareSlider {
  const [progress, setProgress] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = useCallback(
    (clientX: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const box = frame.getBoundingClientRect();
      if (box.width === 0) return;
      const fromStart = rtl ? box.right - clientX : clientX - box.left;
      setProgress(clampProgress((fromStart / box.width) * 100));
    },
    [rtl],
  );

  const stepBy = (amount: number): void => setProgress((value) => clampProgress(value + amount));

  return {
    progress,
    percent: Math.round(progress),
    frameProps: {
      ref: frameRef,
      className: 'relative touch-pan-y select-none',
      onPointerDown: (event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
        handleRef.current?.focus({ preventScroll: true });
      },
      onPointerMove: (event) => {
        if (dragging.current) moveTo(event.clientX);
      },
      onPointerUp: () => {
        dragging.current = false;
      },
      onPointerCancel: () => {
        dragging.current = false;
      },
    },
    handleProps: {
      ref: handleRef,
      role: 'slider',
      tabIndex: 0,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-orientation': 'horizontal',
      'aria-valuenow': Math.round(progress),
      onKeyDown: (event) => {
        // The key that means "more before" is the one that points at the reading edge.
        const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
        const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
        if (event.key === forward) stepBy(event.shiftKey ? BIG_STEP : STEP);
        else if (event.key === backward) stepBy(event.shiftKey ? -BIG_STEP : -STEP);
        else if (event.key === 'Home') setProgress(0);
        else if (event.key === 'End') setProgress(100);
        else return;
        event.preventDefault();
      },
    },
    reset: () => setProgress(50),
  };
}
