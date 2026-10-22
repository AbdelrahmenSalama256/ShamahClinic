/**
 * Which lead fields a given account may see.
 *
 * The console shows leads to more people than the clinic would want its
 * client list read by — a Viewer reports on volumes, an Editor wonders where
 * enquiries come from. So the row is returned either way and the contact
 * fields are blanked, rather than the whole lead being withheld: a count is
 * never a leak, a phone number is.
 *
 * The rule is a permission, not a role name, so an account that was granted
 * `lead.update` or `lead.export` outside the catalog gets the fields too:
 * being able to work a lead implies being able to contact it back.
 *
 * Every surface that leaves the database has to pass through this — the table,
 * the detail panel, CSV export and the Google Sheets outbox. BK-8 wires those;
 * the rule lives here so they cannot disagree.
 */
import { can, type Grant } from './permissions';

/** Columns that identify or contact a real person. */
export const LEAD_CONTACT_FIELDS = ['name', 'phone', 'email', 'message', 'fields'] as const;
export type LeadContactField = (typeof LEAD_CONTACT_FIELDS)[number];

/** As much of a lead row as this rule needs; a full `leads` row satisfies it. */
export interface LeadLike {
  source: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string | null;
  fields?: unknown;
}

export function leadContactVisible(grants: readonly Grant[], lead: LeadLike): boolean {
  const target = lead.source ? { leadSources: lead.source } : {};
  return can(grants, 'lead', 'update', target) || can(grants, 'lead', 'export', target);
}

/** Which contact columns this caller must not see — for the UI to label the gap. */
export function hiddenLeadContactFields(grants: readonly Grant[], lead: LeadLike): LeadContactField[] {
  if (leadContactVisible(grants, lead)) return [];
  return [...LEAD_CONTACT_FIELDS];
}

/**
 * A copy of `lead` with the contact columns blanked when the caller may not
 * have them. Only keys that exist are blanked, so a list projection that never
 * selected `message` comes back unchanged apart from the flag.
 */
export function redactLead<T extends LeadLike>(grants: readonly Grant[], lead: T): T & { contact_hidden: boolean } {
  if (leadContactVisible(grants, lead)) return { ...lead, contact_hidden: false };
  const blanks: Record<LeadContactField, unknown> = { name: '', phone: '', email: '', message: null, fields: null };
  // Only keys the caller actually selected are blanked, so a list projection
  // that never fetched `message` comes back unchanged apart from the flag.
  const only: Partial<Record<LeadContactField, unknown>> = {};
  for (const field of LEAD_CONTACT_FIELDS) if (field in lead) only[field] = blanks[field];
  return { ...lead, ...only, contact_hidden: true };
}
