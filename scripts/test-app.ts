import { spawn } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function startApp(databaseUrl: string = process.env.DATABASE_URL || '') {
  let name = '';
  try { name = new URL(databaseUrl).pathname.slice(1); } catch {}
  if (!/^finance_(?:test|restore)_[a-f0-9]{32}$/.test(name)) {
    throw new Error('Test application servers require an isolated finance_test_ or finance_restore_ database.');
  }
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    reservation.close((error) => error ? reject(error) : resolve());
  });
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [
    path.resolve('node_modules', 'next', 'dist', 'bin', 'next'),
    'start', '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError: Error | undefined;
  child.stdout.on('data', (data) => { output = (output + data).slice(-8000); });
  child.stderr.on('data', (data) => { output = (output + data).slice(-8000); });
  child.once('error', (error) => { spawnError = error; });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  const stop = async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
    timeout.unref();
    try { child.kill('SIGTERM'); await exited; }
    finally { clearTimeout(timeout); }
  };
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Application exited before becoming ready:\n${output}`);
      try {
        const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(1000), redirect: 'manual' });
        await response.text();
        if (response.status === 200) return { base, stop };
      } catch {
        // The server may not have bound its port yet.
      }
      await delay(100);
    }
    throw new Error(`Application startup timed out:\n${output}`);
  } catch (error) { await stop(); throw error; }
}
