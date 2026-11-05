import { type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The status family: how much a piece of news matters, and the four shapes it can arrive in.
 *
 * `ui.css` paints all of them and `globals.css` imports `ui.css`, so a badge on a public
 * card and the console's row-state chip are one definition — which is the whole reason this
 * file exists. Before it, `console.css` answered "how much does this matter" three different
 * ways in three different members, and the tone vocabulary below is the one answer.
 *
 * `tone` becomes `data-tone` and `neutral` is the one value that renders no attribute,
 * because there is no `[data-tone='neutral']` rule to match it: an absent tone and a neutral
 * one are the same sentence, and a hook nothing styles is a hook that will drift.
 */

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger';

/** `undefined` in the type, `'neutral'` at the call site — the same word the CSS falls back to. */
function toneAttr(tone: Tone): 'ok' | 'warn' | 'danger' | undefined {
  return tone === 'neutral' ? undefined : tone;
}

interface ToneShape {
  tone?: Tone;
  className?: string;
}

export type BadgeProps = ToneShape & Readonly<{ children: ReactNode }>;

/**
 * One word about one thing: a row's state, a user's role, a setting's group.
 *
 * No margin of its own. `.console-chip` carried `margin-inline-end: 0.3rem`, so a chip was
 * spaced by a rule inside it — two side by side got a gap after the last one, and one alone
 * in a heading got a trailing margin nothing asked for. The group owns its `gap`.
 */
export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={clsx('ui-badge', className)} data-tone={toneAttr(tone)}>
      {children}
    </span>
  );
}

export type AlertProps = ToneShape &
  Readonly<{
    children: ReactNode;
    /** Overrides the derived role. Only needed when a box neither reports nor confirms. */
    role?: 'alert' | 'status';
  }>;

/**
 * A paragraph the person needs to read, in a box the tone describes.
 *
 * The role comes from the tone unless the call site names one: bad news interrupts, an
 * ok/warn line is announced politely, and a box that explains a standing fact — the
 * read-only editor's banner — is announced by nobody, because a live region that never
 * changes trains people to ignore live regions.
 *
 * It is a `<p>` and it holds buttons: the list's failure line has had a Retry in it since
 * BK-13.3, and a `<button>` is phrasing content, so the sentence and its action stay in one
 * element instead of a `div` that says nothing about being a message.
 */
export function Alert({ tone = 'neutral', role, className, children }: AlertProps) {
  return (
    <p
      className={clsx('ui-alert', className)}
      data-tone={toneAttr(tone)}
      role={role ?? (tone === 'danger' ? 'alert' : tone === 'neutral' ? undefined : 'status')}
    >
      {children}
    </p>
  );
}

export type NoteProps = ToneShape & Readonly<{ children: ReactNode }>;

/**
 * The caption-strength line under or beside something: a hint, a total, a label.
 *
 * A `<span>`, not a `<p>`: the pager's "of 4" and the editor's save state sit inside
 * controls that are themselves spans, and block content inside a span is not HTML. The four
 * names this replaces — `.console-note`, `.console-count`, `.console-meta`,
 * `.console-account-label` — differed only in the space around them, so the space stayed
 * with the surface and the type came here.
 */
export function Note({ tone = 'neutral', className, children }: NoteProps) {
  return (
    <span className={clsx('ui-note', className)} data-tone={toneAttr(tone)}>
      {children}
    </span>
  );
}

export type EmptyProps = Readonly<{ children: ReactNode; className?: string }>;

/**
 * "Nothing here" in a shape that cannot be mistaken for "still loading" or "the page broke".
 *
 * The palette had a secondary line and the list borrowed `.console-lede`, the class 15
 * paragraphs use for their opening sentence — so the emptiest state on the screen was
 * wearing its loudest one.
 */
export function Empty({ children, className }: EmptyProps) {
  return <div className={clsx('ui-empty', className)}>{children}</div>;
}

export type SkeletonProps = Readonly<{
  rows?: number;
  /** What is loading, for the voice. Without it the block is `aria-hidden` — decoration around an absence. */
  label?: string;
  className?: string;
}>;

/**
 * The shape of what has not arrived, in the height the real rows will take.
 *
 * `rows` exists because a loading list knows how many rows it is waiting for: the caller
 * passes the number and this renders that many wells with the rhythm the real list uses, so
 * the block does not jump when the data lands. `label` is what replaces the loading *word* —
 * the wells say "something is coming" to the eye, and a `role="status"` region says it to the
 * voice, which an `aria-label` on a list of empty boxes never did.
 */
export function Skeleton({ rows = 1, label, className }: SkeletonProps) {
  return (
    <div className={clsx('ui-skeletons', className)} role={label ? 'status' : undefined} aria-hidden={label ? undefined : true}>
      {label ? <Note className="sr-only">{label}</Note> : null}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ui-skeleton" />
      ))}
    </div>
  );
}

export type MarkState = 'yes' | 'no' | 'none';

export type MarkProps = Readonly<{ state: MarkState; label: string; className?: string }>;

const GLYPH: Record<MarkState, string> = { yes: '●', no: '○', none: '—' };

/**
 * A cell whose whole content is yes, no, or nothing.
 *
 * The glyph is what the eye reads and the `label` is what the voice reads: printed as
 * `●`/`○`/`—` alone, three columns of state were three columns of silence, since a screen
 * reader announces a bare circle at best and nothing at the usual punctuation setting. The
 * glyph carries the colour, `data-state` the meaning, and the glyph itself is `aria-hidden`
 * so the word is not read twice.
 */
export function Mark({ state, label, className }: MarkProps) {
  return (
    <span className={clsx('ui-mark', className)} data-state={state}>
      <span aria-hidden="true">{GLYPH[state]}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
