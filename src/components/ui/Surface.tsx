import { type ComponentProps, type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The shells: the box content sits in, and the one button in a row that opens it.
 *
 * `ui.css` paints both, and `globals.css` imports `ui.css`, so a card on a public page and
 * the console's stat tile are one definition — which is the reason this file exists rather
 * than five near-identical rules in `console.css`.
 *
 * `Card` renders the tag the content deserves, not a `div` for everything: the overview's
 * tiles are `div`s inside a `dl`, a card-mode row is an `li` inside a `ul`, and a panel that
 * groups a form's fields is a `section`. A call site that already owns a semantic element —
 * the `form` a login posts from — puts `className="ui-card"` on it instead of nesting a
 * second box: the shell is the definition, and a form inside a card inside a form is two
 * objects where there is one.
 */

type CardTag = 'div' | 'li' | 'section';

/** Typed against `HTMLElement`, not against `div`: `li` and `section` are tags the call site
 *  picks, and a handler written for one of them is a type error on the other two. The two
 *  extras `li` carries — `type` and `value` — are not things a shell means. */
export type CardProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    /** `div` is the default; `li` and `section` are what the list and a panel really are. */
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
      className={clsx('ui-card', className)}
      data-active={active || undefined}
      data-flat={flat || undefined}
      data-flush={flush || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * The clickable thing inside a row or a card.
 *
 * It is a `button` and not a link because selecting a row does not leave the page: it
 * changes what the editor pane beside the list holds, and the URL that follows is the
 * list's own state. The underline lands on the title (`RowTitle`) and not across the row,
 * because the row is wider than its target — a cell of empty space to the side is not
 * something a click should answer to.
 */
export type RowActionProps = Omit<ComponentProps<'button'>, 'type'> & Readonly<{ type?: 'button' | 'submit' }>;

export function RowAction({ type = 'button', className, children, ...rest }: RowActionProps) {
  return (
    <button type={type} className={clsx('ui-row-action', className)} {...rest}>
      {children}
    </button>
  );
}

/** A row's title, in the voice the row's other cells do not get. */
export function RowTitle({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <span className={clsx('ui-row-title', className)}>{children}</span>;
}

/** The machine name under the human one: a slug, a key, an id. A `code` because it is
 *  literal text a person may have to type. */
export function RowKey({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return <code className={clsx('ui-row-key', className)}>{children}</code>;
}
