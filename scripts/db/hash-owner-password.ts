import { hashPassword, passwordProblem } from '../../src/lib/auth/password';
import { readSecret } from './read-secret';

async function main(): Promise<void> {
  const password = await readSecret('New Owner password');
  const problem = passwordProblem(password);
  if (problem) throw new Error(`${problem} No hash was generated.`);
  console.log(await hashPassword(password));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
