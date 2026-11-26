import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadLocalEnv } from './load-env';

loadLocalEnv();

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required. Set it in .env.local or the environment.');
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, [
    path.resolve('node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js'),
    '--ignore-pattern', '^schema\\.sql$',
    ...process.argv.slice(2),
  ], { stdio: 'inherit', env: process.env });

  child.once('error', (error) => {
    console.error('Could not start migrations:', error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
