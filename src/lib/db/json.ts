/**
 * MariaDB has no real JSON type: `JSON` is LONGTEXT plus a `json_valid()` CHECK.
 * mysql2 therefore serialises a JS object as `key = 'value', …` SQL text, which
 * is not valid JSON, and the write dies with
 * `CONSTRAINT lists.item_schema failed`. Reads are the mirror image: the driver
 * parses the column back into an object.
 *
 * So every JSON column is written through this function and read as a value.
 * The `Json<T>`/`JsonOr<T>` types in ./types.ts make skipping it a compile error.
 */
export function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}
