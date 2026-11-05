/**
 * The JavaScript half of the motion table in `src/styles/tokens.css` (MB-2).
 *
 * framer-motion takes seconds and a bezier array, so it cannot read a CSS custom
 * property; this module is the same table written in the unit its caller needs. Every
 * number here is the `--dur-*` / `--ease-*` token of the same name, and
 * `tests/motion.test.ts` fails the suite when the two drift apart — a component should
 * ask for a role and never write a duration.
 *
 * Delays are deliberately absent. A delay is not a shared length, it is one section's
 * choreography: the hero's four copy blocks enter 50 ms apart and the marquee's items
 * 40 ms apart, and a token for each would be a number with exactly one consumer wearing
 * a general-purpose name.
 */

/** `--ease-signature`: the curve the reference names 12 times in CSS and 56 in its JSX. */
export const EASE_SIGNATURE = [0.22, 1, 0.36, 1] as const;

/**
 * Seconds. Each key is the `--dur-<key>` token in `src/styles/tokens.css`, and only the
 * roles a call site in this repo asks for are mirrored — `--dur-menu`, `--dur-pan` and
 * `--dur-fast` are read by CSS, never by framer, and a JS alias nobody calls is a number
 * that can rot. `tests/motion.test.ts` holds both halves of that promise.
 */
export const DUR = {
  quick: 0.2,
  base: 0.22,
  ui: 0.25,
  hover: 0.3,
  settle: 0.35,
  step: 0.4,
  fade: 0.5,
  reveal: 0.7,
  enter: 0.8,
  count: 1.4,
} as const;

export type MotionRole = keyof typeof DUR;

/** A framer `transition` prop for one role: the token's length on the house curve. */
export function motionTransition(role: MotionRole) {
  return { duration: DUR[role], ease: EASE_SIGNATURE };
}

/** Milliseconds, for the one component that ticks a number instead of a property. */
export function milliseconds(role: MotionRole): number {
  return DUR[role] * 1000;
}
