export interface MigrationFile {
  name: string;
  contents: string;
  checksum: string;
}

export function migrationFiles(dir: string): MigrationFile[];
export function splitStatements(contents: string): string[];
export function readEnvFile(path: string): Record<string, string>;
