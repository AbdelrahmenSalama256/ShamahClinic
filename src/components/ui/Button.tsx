import { type ComponentProps, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The control every surface in the product uses: the console's save bar, a public form's
 * submit, a filter chip that is also a toggle.
 *
 * `ui.css` — which `globals.css` imports, so it is in every document already — paints it.
 * The API is deliberately small and attribute-shaped: the state a caller passes becomes a
 * `data-*` attribute and nothing else, so the stylesheet is the only place a look lives,
 * and a call site cannot invent a sixth variant with a stray class.
 *
 * `loading` disables the button as it animates it. One click, one request: a person who
 * presses "Publish" twice should get one revision, not two, and the control that is
 * waiting says so in its own label slot rather than in a toast after the fact.
 */

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
      className={clsx('ui-button', className)}
      data-variant={variant}
      data-size={size}
      data-active={active || undefined}
      data-block={block || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-button-spin" aria-hidden="true" /> : leading}
      {children}
      {trailing}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<'a'> & ButtonShape;

/** The same control as a destination. It renders an `a`, not a `next/link`, so the href
 *  stays something a right-click, an open-in-new-tab and a crawler can read; a call site
 *  that really wants the client router keeps its own `Link` and passes `className`.
 *  There is no `loading`: a link does not wait for a response, it leaves. */
export function ButtonLink({ variant = 'default', size, active, block, leading, trailing, className, children, ...rest }: ButtonLinkProps) {
  return (
    <a
      className={clsx('ui-button', className)}
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
