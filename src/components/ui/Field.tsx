import { type ComponentProps, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The field family: a labelled control, the message under it, and the checkbox that is its
 * own label.
 *
 * `ui.css` paints all of it, and `globals.css` imports `ui.css`, so a form on the public
 * site and the console's editor get the same boundary, the same tap floor and the same
 * focus ring without either of them carrying a copy of the numbers. The API is the
 * attribute-shaped one `Button` uses: a prop becomes a `data-*` hook or a real ARIA
 * attribute, and a call site cannot invent a sixth state with a stray class.
 *
 * `Field` cannot be given an orphan label — `htmlFor` is required, because a `<label>`
 * that is a *sibling* of its control associates by nothing else. A checkbox is the case
 * that does not need it: `Checkbox` renders the label around the input, which is also what
 * makes the whole row the target.
 */

interface ControlShape {
  /** Shares a row with buttons, so it holds `--tap` — the floor density does not lower. */
  bar?: boolean;
  className?: string;
}

export type InputProps = ComponentProps<'input'> & ControlShape;

export function Input({ bar, className, ...rest }: InputProps) {
  return <input className={clsx('ui-control', className)} data-bar={bar || undefined} {...rest} />;
}

export type TextareaProps = ComponentProps<'textarea'> & ControlShape;

export function Textarea({ bar, className, ...rest }: TextareaProps) {
  return <textarea className={clsx('ui-control', className)} data-bar={bar || undefined} {...rest} />;
}

export type SelectProps = ComponentProps<'select'> & ControlShape;

export function Select({ bar, className, children, ...rest }: SelectProps) {
  return (
    <select className={clsx('ui-control', className)} data-bar={bar || undefined} {...rest}>
      {children}
    </select>
  );
}

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & Readonly<{ label?: ReactNode }>;

/**
 * The `label` is optional because a box in a table cell has no room for one and the row
 * already says what it is — that name goes on the input as `aria-label`, and the label
 * element stays as the tap target. The box is never left unlabelled.
 */
export function Checkbox({ label, className, disabled, ...rest }: CheckboxProps) {
  return (
    <label className={clsx('ui-check', className)} data-disabled={disabled || undefined}>
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
    <div className={clsx('ui-field', className)} data-invalid={errors.length > 0 || undefined}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {errors.map((message) => (
        <span key={message} className="ui-field-error" role="alert">
          {message}
        </span>
      ))}
      {note}
    </div>
  );
}
