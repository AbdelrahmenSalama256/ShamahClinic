import { type ComponentProps } from 'react';
import { clsx } from 'clsx';

/**
 * The chips: a filter that is also a toggle, and a saved view whose name and cross are
 * tapped separately.
 *
 * Three shapes, one radius. `.console-chip-button`, `.console-view-chip` and
 * `.console-chip-x` each wrote `border-radius: 999px` by hand, and the capsule stopped
 * being a pill the day `--radius-pill` was retuned — which is why the primitive reads the
 * token and `tests/ui-primitives.test.ts` forbids the literal anywhere in either sheet.
 *
 * The removable chip is not a button containing a button, which is invalid markup: it is a
 * `span` holding two buttons, and the capsule's border belongs to the `span`. That is also
 * why each half keeps its own tap floor — deleting a view and opening one are two different
 * mistakes to make, and a 44px capsule split down the middle gives each of them 44px.
 */

export type ChipProps = ComponentProps<'button'> & Readonly<{ active?: boolean }>;

/**
 * A filter. `active` is passed by the call site along with its own `aria-pressed`, because
 * a chip can be a toggle (the state filter) or an action that closes the group (a saved
 * view, which replaces the whole query and is never "pressed").
 */
export function Chip({ active, className, children, type = 'button', disabled, ...rest }: ChipProps) {
  return (
    <button type={type} className={clsx('ui-chip', className)} data-active={active || undefined} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

/** The group of them: `role="group"` with a name, so a screen reader says how many
 *  switches there are before it reads the first one. */
export function ChipRow({ label, className, children, ...rest }: Omit<ComponentProps<'div'>, 'role'> & Readonly<{ label: string }>) {
  return (
    <div role="group" aria-label={label} className={clsx('ui-chip-row', className)} {...rest}>
      {children}
    </div>
  );
}

/** The capsule a saved view lives in. */
export function ChipTag({ className, children, ...rest }: ComponentProps<'span'>) {
  return (
    <span className={clsx('ui-chip-tag', className)} {...rest}>
      {children}
    </span>
  );
}

/**
 * The cross. Its label is the whole sentence — "remove view: Last week's drafts" — because
 * a button whose only content is an icon is announced as "button" at best, and the name
 * has to say which view it is leaving.
 */
export function ChipRemove({ className, children, type = 'button', disabled, ...rest }: ChipProps) {
  return (
    <button type={type} className={clsx('ui-chip-x', className)} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
