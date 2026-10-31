/**
 * Field messages, in the language the console is in.
 *
 * The server's vocabulary is small and fixed: `parseWrites()` in `../content/kinds.ts`
 * answers with one of six phrases, and a zod rejection answers with a path and a
 * sentence. Those strings are the wire format — they are what the test suite asserts and
 * what the store logs — so the console translates them here instead of making the API
 * bilingual. Anything unmapped is passed through rather than hidden, because a new
 * server message should read as an odd English sentence, not as nothing.
 *
 * The editor's own client-side parse (a half-typed number, JSON that does not close)
 * reuses these exact phrases on purpose: one message means one problem whether the
 * browser or MariaDB found it, so the person editing sees one rule, not two.
 */
import type { MessageKey } from './messages';

export interface FieldIssue {
  path: string;
  message: string;
}

const KEYS: Record<string, MessageKey> = {
  'expected text': 'content.issue.text',
  'expected a number': 'content.issue.number',
  'expected true or false': 'content.issue.flag',
  'expected an object or an array': 'content.issue.json',
  'expected a list': 'content.issue.list',
  'unknown option': 'content.issue.option',
  'not valid JSON': 'content.issue.invalid_json',
  'unknown field': 'content.issue.unknown',
  required: 'content.issue.required',
};

export function issueText(labels: Record<MessageKey, string>, issue: FieldIssue): string {
  const long = /^longer than (\d+) characters$/.exec(issue.message);
  if (long) return labels['content.issue.long'].replace('{max}', long[1]);
  const key = KEYS[issue.message];
  return key === undefined ? issue.message : labels[key];
}

/** `fields.title` from a zod path, `title` from `parseWrites` — one field name either way. */
export function fieldOf(path: string): string {
  return path.replace(/^fields\./, '').split('.')[0] ?? path;
}

export interface IssueMap {
  /** field name → messages, in the order the server reported them */
  byField: Record<string, string[]>;
  /** a problem no field owns — a bad `version`, a missing `locale` — for the notice line */
  other: string[];
}

/** A rejected write, remembered alongside the field value that caused it. */
export type TrackedIssue = FieldIssue & { was: string };

/**
 * The value a field name stands for in the form.
 *
 * A bilingual row has one box per field; a list document spreads one field across
 * `name_ar`, `name_en`, `benefits_ar.0` and so on. A message about `benefits.0` therefore
 * has to notice a change in either language row, so the fingerprint is every form entry
 * the root owns, in a stable order.
 */
export function formValueOf(form: Record<string, unknown>, root: string): string {
  if (root in form) return String(form[root] ?? '');
  return Object.keys(form)
    .filter((key) => key.startsWith(`${root}_`) || key.startsWith(`${root}.`))
    .sort()
    .map((key) => `${key}=${String(form[key] ?? '')}`)
    .join('\u0001');
}

/**
 * Drop the server's messages that no longer describe the screen.
 *
 * The server refuses a value, the person corrects it, and the red sentence left standing
 * under the corrected box reads as a new refusal. A message therefore lives only while the
 * field still holds the value it was written for. One with no field of its own — a stale
 * `version`, a missing `locale` — has nothing to match against and stays until the next
 * attempt answers.
 */
export function liveIssues(issues: TrackedIssue[], form: Record<string, unknown>): FieldIssue[] {
  return issues.filter((issue) => formValueOf(form, fieldOf(issue.path)) === issue.was);
}

/**
 * Group the issues a save came back with under the fields the editor can actually mark.
 * A names field means the person should see the sentence under that box, not in a banner
 * they will read after typing over it.
 */
export function groupIssues(labels: Record<MessageKey, string>, issues: FieldIssue[], fieldNames: string[]): IssueMap {
  const known = new Set(fieldNames);
  const byField: Record<string, string[]> = {};
  const other: string[] = [];
  for (const issue of issues) {
    const name = fieldOf(issue.path);
    const text = issueText(labels, issue);
    if (!known.has(name)) {
      // Every unknown key produces the same sentence, so without the key the banner says
      // nothing about which one it means. The key is the only name the person can act on.
      const line = issue.message === 'unknown field' && name ? `${name} — ${text}` : text;
      if (!other.includes(line)) other.push(line);
      continue;
    }
    const list = (byField[name] ??= []);
    // The same sentence can arrive twice — once from the browser's parse and once from
    // the server for a field both of them check — and one box shows one message.
    if (!list.includes(text)) list.push(text);
  }
  return { byField, other };
}
