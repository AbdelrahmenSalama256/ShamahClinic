export interface MigrationFile {
  name: string;
  contents: string;
  checksum: string;
}

export function migrationFiles(dir: string): MigrationFile[];
export function splitStatements(contents: string): string[];
export function readEnvFile(path: string): Record<string, string>;
export function accountHost(env: Record<string, string | undefined>): string;
