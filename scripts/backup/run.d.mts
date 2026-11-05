export interface BackupArgs {
  envFile: string;
  uploads: string;
  out: string;
  keep: number;
  apply: boolean;
}

export function parseArgs(argv: string[]): BackupArgs;
export function backupStamp(at?: Date): string;
export function planRetention(names: string[], keep: number): { keep: string[]; remove: string[] };
export function sha256File(path: string): string;
export function folderStats(root: string): { files: number; bytes: number };
