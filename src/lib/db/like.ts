/**
 * `LIKE` safety, in one place: backslash is MySQL's own escape character, so it has to
 * escape itself before `%` and `_` are escaped. Both the palette's record search and the
 * list's filter bind this — the pattern is a parameter, never a string in the SQL.
 *
 * Checked against the local server rather than assumed, because it is the kind of thing a
 * `sql_mode` flips: `%` is `IGNORE_SPACE,STRICT_TRANS_TABLES,…` with no
 * `NO_BACKSLASH_ESCAPES`, so a search for `20%` matches the row named `20% off` and not
 * the one named `20 percent`.
 */
export function likeOf(term: string): string {
  return `%${term.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
