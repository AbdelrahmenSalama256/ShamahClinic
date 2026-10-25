import { type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The console kit: the controls a work surface needs, painted by `console.css`.
 *
 * These are deliberately *not* the site's `@/components/ui` primitives. The console and
 * the public site share a design language, not a stylesheet — `console.css` owns every
 * colour, radius, floor and duration here, and no class below starts with `ui-`.
 *
 * The API is the attribute-shaped one the old kit used, so a call site did not have to
 * change: a state prop becomes a `data-*` hook, and the stylesheet is the only place a
 * look lives.
 */

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger';

/** `undefined` in the type, `'neutral'` at the call site — the same word the CSS falls back to. */
function toneAttr(tone: Tone): 'ok' | 'warn' | 'danger' | undefined {
  return tone === 'neutral' ? undefined : tone;
}

/* --- button ---------------------------------------------------------------- */

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm' | 'icon';

interface ButtonShape {
  /** `primary` is the one gold action a screen is about; `danger` is the filled red. */
  variant?: ButtonVariant;
  /** `md` is the default; `icon` is a square control whose whole label is its glyph. */
  size?: ButtonSize;
  /** The pressed state of a toggle — a filter that is on, the tab that is showing. */
  active?: boolean;
  /** Fill the row instead of hugging its words. */
  block?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export type ButtonProps = ComponentProps<'button'> & ButtonShape & { loading?: boolean };

export function Button({
  variant = 'default',
  size,
  active,
  block,
  loading,
  leading,
  trailing,
  className,
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx('console-btn', className)}
      data-variant={variant}
      data-size={size}
      data-active={active || undefined}
      data-block={block || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="console-btn-spin" aria-hidden="true" /> : leading}
      {children}
      {trailing}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<'a'> & ButtonShape;

/** The same control as a destination. It renders an `a`, not a `next/link`, so the href
 *  stays something a right-click, an open-in-new-tab and a crawler can read. */
export function ButtonLink({ variant = 'default', size, active, block, leading, trailing, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a
      className={clsx('console-btn', className)}
      data-variant={variant}
      data-size={size}
      data-active={active || undefined}
      data-block={block || undefined}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </a>
  );
}

/* --- field ----------------------------------------------------------------- */

interface ControlShape {
  /** Shares a row with buttons, so it holds `--c-tap`, the same floor they hold. */
  bar?: boolean;
  className?: string;
}

export type InputProps = ComponentProps<'input'> & ControlShape;

export function Input({ bar, className, ...rest }: InputProps) {
  return <input className={clsx('console-control', className)} data-bar={bar || undefined} {...rest} />;
}

export type TextareaProps = ComponentProps<'textarea'> & ControlShape;

export function Textarea({ bar, className, ...rest }: TextareaProps) {
  return <textarea className={clsx('console-control', className)} data-bar={bar || undefined} {...rest} />;
}

export type SelectProps = ComponentProps<'select'> & ControlShape;

export function Select({ bar, className, children, ...rest }: SelectProps) {
  return (
    <select className={clsx('console-control', className)} data-bar={bar || undefined} {...rest}>
      {children}
    </select>
  );
}

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & Readonly<{ label?: ReactNode }>;

/** The label is the target; a box in a table cell has no room for one, so its name goes
 *  on the input as `aria-label` and the label element stays as the tap target. */
export function Checkbox({ label, className, disabled, ...rest }: CheckboxProps) {
  return (
    <label className={clsx('console-check', className)} data-disabled={disabled || undefined}>
      <input type="checkbox" disabled={disabled} {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

export type FieldProps = Readonly<{
  label: ReactNode;
  htmlFor: string;
  /** Rendered under the control, one `role="alert"` per message, in the order given. */
  errors?: readonly string[];
  /** Secondary text under the messages — the "saves immediately" kind. */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}>;

export function Field({ label, htmlFor, errors = [], note, children, className }: FieldProps) {
  return (
    <div className={clsx('console-field', className)} data-invalid={errors.length > 0 || undefined}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {errors.map((message) => (
        <span key={message} className="console-field-error" role="alert">
          {message}
        </span>
      ))}
      {note}
    </div>
  );
}

/* --- status ---------------------------------------------------------------- */

interface ToneShape {
  tone?: Tone;
  className?: string;
}

export type BadgeProps = ToneShape & Readonly<{ children: ReactNode }>;

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={clsx('console-badge', className)} data-tone={toneAttr(tone)}>
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

/** The role comes from the tone unless the call site names one: bad news interrupts, an
 *  ok/warn line is announced politely, and a standing fact is announced by nobody. */
export function Alert({ tone = 'neutral', role, className, children }: AlertProps) {
  return (
    <p
      className={clsx('console-alert', className)}
      data-tone={toneAttr(tone)}
      role={role ?? (tone === 'danger' ? 'alert' : tone === 'neutral' ? undefined : 'status')}
    >
      {children}
    </p>
  );
}

export type NoteProps = ToneShape & Readonly<{ children: ReactNode }>;

/** A `<span>`, not a `<p>`: notes sit inside controls and inside paragraphs. */
export function Note({ tone = 'neutral', className, children }: NoteProps) {
  return (
    <span className={clsx('console-note', className)} data-tone={toneAttr(tone)}>
      {children}
    </span>
  );
}

export type EmptyProps = Readonly<{ children: ReactNode; className?: string }>;

export function Empty({ children, className }: EmptyProps) {
  return <div className={clsx('console-empty', className)}>{children}</div>;
}

export type SkeletonProps = Readonly<{
  rows?: number;
  /** What is loading, for the voice. Without it the block is `aria-hidden`. */
  label?: string;
  className?: string;
}>;

export function Skeleton({ rows = 1, label, className }: SkeletonProps) {
  return (
    <div className={clsx('console-skeletons', className)} role={label ? 'status' : undefined} aria-hidden={label ? undefined : true}>
      {label ? <Note className="console-sr-only">{label}</Note> : null}
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="console-skeleton" />
      ))}
    </div>
  );
}

export type MarkState = 'yes' | 'no' | 'none';

export type MarkProps = Readonly<{ state: MarkState; label: string; className?: string }>;

const GLYPH: Record<MarkState, string> = { yes: '●', no: '○', none: '—' };

/** The glyph is what the eye reads and the `label` is what the voice reads. */
export function Mark({ state, label, className }: MarkProps) {
  return (
    <span className={clsx('console-mark', className)} data-state={state}>
      <span aria-hidden="true">{GLYPH[state]}</span>
      <span className="console-sr-only">{label}</span>
    </span>
  );
}

/* --- surface --------------------------------------------------------------- */

type CardTag = 'div' | 'li' | 'section';

export type CardProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    as?: CardTag;
    /** The row the editor is showing, or the tile that is switched on. */
    active?: boolean;
    /** A shell that cannot lift: a list that scrolls inside itself has no edge to throw. */
    flat?: boolean;
    /** A shell whose children do their own padding: a table's cells, a scroll box. */
    flush?: boolean;
  }>;

export function Card({ as: Tag = 'div', active, flat, flush, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={clsx('console-card', className)}
      data-active={active || undefined}
      data-flat={flat || undefined}
      data-flush={flush || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export type RowActionProps = Omit<ComponentProps<'button'>, 'type'> & Readonly<{ type?: 'button' | 'submit' }>;

export function RowAction({ type = 'button', className, children, ...rest }: RowActionProps) {
  return (
    <button type={type} className={clsx('console-row-action', className)} {...rest}>
      {children}
    </button>
  );
}

export function RowTitle({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <span className={clsx('console-row-title', className)}>{children}</span>;
}

/** The machine name under the human one: a slug, a key, an id. */
export function RowKey({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <code className={clsx('console-row-key', className)}>{children}</code>;
}

/* --- chip ------------------------------------------------------------------ */

export type ChipProps = ComponentProps<'button'> & Readonly<{ active?: boolean }>;

export function Chip({ active, className, children, type = 'button', disabled, ...rest }: ChipProps) {
  return (
    <button type={type} className={clsx('console-chip', className)} data-active={active || undefined} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export function ChipRow({ label, className, children, ...rest }: Omit<ComponentProps<'div'>, 'role'> & Readonly<{ label: string }>) {
  return (
    <div role="group" aria-label={label} className={clsx('console-chip-row', className)} {...rest}>
      {children}
    </div>
  );
}

export function ChipTag({ className, children, ...rest }: ComponentProps<'span'>) {
  return (
    <span className={clsx('console-chip-tag', className)} {...rest}>
      {children}
    </span>
  );
}

/** The cross's label is the whole sentence — "remove view: Last week's drafts". */
export function ChipRemove({ className, children, type = 'button', disabled, ...rest }: ChipProps) {
  return (
    <button type={type} className={clsx('console-chip-x', className)} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
