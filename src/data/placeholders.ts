/**
 * Single source of truth for figures and claims.
 *
 * `verified` figures are real and may be displayed (branch count, opening
 * hours, service list). `unverified` figures are placeholders that must stay
 * hidden until the clinic confirms them; components gate on `showUnverified`.
 */

export const verifiedFacts = {
  branchCount: 3,
  workingHours: { ar: "يومياً من ١٠:٠٠ ص إلى ١٠:٠٠ م", en: "Daily 10:00 AM – 10:00 PM" },
  femaleStaff: true,
} as const;

export const unverifiedStats = {
  // Placeholder marketing figures — DO NOT display until confirmed by clinic.
  happyClients: 15000,
  satisfactionRating: 4.9,
  yearsInPractice: 12,
  sessionsDelivered: 40000,
} as const;

/** Flip to true only after the clinic verifies the figures above. */
export const showUnverified = false;
