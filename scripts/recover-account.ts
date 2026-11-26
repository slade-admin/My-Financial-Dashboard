import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { closePool } from '../src/lib/db';
import { recoverAccount } from '../src/lib/repo/auth';
import { loadLocalEnv } from './load-env';

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run account recovery in your own interactive terminal.');
  loadLocalEnv();
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const email = await prompt.question('Sign-in email to recover: ');
  const confirmation = await prompt.question('This revokes that account\'s sessions and SMS tokens. Type RESET to continue: ');
  prompt.close();
  if (confirmation !== 'RESET') throw new Error('Recovery cancelled. No account changed.');

  const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const secretPrompt = createInterface({ input: process.stdin, output: silent, terminal: true });
  try {
    process.stdout.write('New password (8-1024 characters; hidden): ');
    const password = await secretPrompt.question('');
    process.stdout.write('\nRepeat new password (hidden): ');
    const repeated = await secretPrompt.question('');
    process.stdout.write('\n');
    if (password !== repeated) throw new Error('Passwords do not match. No account changed.');
    await recoverAccount(email, password);
    console.log('Password reset. Sessions and SMS tokens revoked. Sign in, then create new forwarding tokens if needed.');
  } finally { secretPrompt.close(); }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Account recovery failed.');
  process.exitCode = 1;
}).finally(closePool);
