/**
 * Clinic facts with no WordPress record (branch count, hours, all-female staff).
 * Kept here rather than inline so the same verified figures are used everywhere.
 */
export const verifiedFacts = {
  branchCount: 3,
  workingHours: { ar: "يومياً من ١٠:٠٠ ص إلى ١٠:٠٠ م", en: "Daily 10:00 AM – 10:00 PM" },
  femaleStaff: true,
} as const;
