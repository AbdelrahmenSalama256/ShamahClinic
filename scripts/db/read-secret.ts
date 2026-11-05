/**
 * Reads a secret without it ever becoming a process argument — `ps`, shell
 * history and CI logs all keep argv, and a password in any of them is a
 * compromised owner account.
 *
 * `--password-stdin` pipes it in (for scripts), otherwise the terminal is put in
 * raw mode and nothing is echoed.
 */
async function consumeStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

function prompt(text: string): Promise<void> {
  process.stdout.write(text);
  return Promise.resolve();
}

/** Muted typing. Backspace and Ctrl+C behave; nothing else is echoed. */
async function readHidden(text: string): Promise<string> {
  await prompt(text);
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error('Standard input is not a terminal. Type the password at a real console or use --password-stdin.'));
      return;
    }
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const onData = (data: string): void => {
      for (const char of data) {
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (char < ' ') continue;
        value += char;
      }
    };
    const cleanup = (): void => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    input.on('data', onData);
  });
}

/** Returns the typed password, or throws with a message that never repeats it. */
export async function readSecret(label: string): Promise<string> {
  if (process.argv.includes('--password-stdin')) return consumeStdin();
  const password = await readHidden(`${label} (typing is hidden): `);
  const again = await readHidden('Type it again to confirm: ');
  if (password !== again) throw new Error('The two entries did not match. Nothing was written.');
  if (password.length === 0) throw new Error('Empty password. Nothing was written.');
  return password;
}
