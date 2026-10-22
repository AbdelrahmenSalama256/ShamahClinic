/**
 * Password hashing. Cost 12 is the number that keeps a stolen dump expensive
 * without making login crawl on cPanel shared CPU.
 */
import bcrypt from 'bcryptjs';
import { BCRYPT_COST } from './env';

export const PASSWORD_MIN = 12;
/** bcrypt silently ignores everything past 72 bytes, so a longer "strong" password is a lie. */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Compared when no user matches the email, so a wrong email costs the same as a
 * wrong password and the endpoint stays a useful timing oracle for enumeration.
 */
const DECOY_HASH = '$2b$12$CdIUyK.i/3m0pCWJYD66xOvW.tOtARC3yFVpbZ0RtgcFzSowiiaTS';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export async function verifyPasswordOrDecoy(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    await verifyPassword(password, DECOY_HASH);
    return false;
  }
  return verifyPassword(password, hash);
}

/** Returns a message in English (the console localises it) or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  const bytes = Buffer.byteLength(password, 'utf8');
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (bytes > PASSWORD_MAX_BYTES) return `Password must be at most ${PASSWORD_MAX_BYTES} bytes (bcrypt ignores anything longer).`;
  if (!/[\p{L}]/u.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one digit.';
  return null;
}
