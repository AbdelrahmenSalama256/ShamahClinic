export function readEnvFile(path: string): Record<string, string>;
export function assertConfirmedTarget(
  target: { database: string },
  args: { apply: boolean; confirmTarget: string | null },
): void;
export function stableStringify(value: unknown): string;
export function rowHash(row: Record<string, unknown>): string;
export function tableHash(rows: Record<string, unknown>[]): string;
export function valueFingerprint(values: unknown[]): string;
export function toSqlValue(value: unknown): unknown;
export function toJsonSqlValue(value: unknown): unknown;
export function jsonColumnsFromChecks(rows: { table: string; clause: string }[]): { table: string; column: string }[];
