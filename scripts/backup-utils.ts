import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { Pool } from 'pg';

const MAGIC = Buffer.from('TRACKSUITE_BACKUP_1\n', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;
const MARKER_SQL = "SELECT current_database() || '|' || EXTRACT(EPOCH FROM pg_postmaster_start_time())::text AS marker";
const sslOptions = new Map([
  ['sslmode', 'PGSSLMODE'], ['sslrootcert', 'PGSSLROOTCERT'], ['sslcert', 'PGSSLCERT'], ['sslkey', 'PGSSLKEY'],
]);

export interface PostgresTools { container?: string }

export function databaseUrl(value: string | undefined, label: string): URL {
  let url: URL;
  try { url = new URL(value || ''); }
  catch { throw new Error(`${label} must be an explicit PostgreSQL connection URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error(`${label} must specify a PostgreSQL host, user and plain database name.`);
  }
  for (const key of url.searchParams.keys()) {
    if (!sslOptions.has(key)) throw new Error(`${label} contains unsupported connection overrides.`);
  }
  return url;
}

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function privatePath(value: string | undefined, label: string): string {
  if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute private path outside the repository and synced folders.`);
  const resolved = path.resolve(value);
  const synced = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
    .some((root) => root && isWithin(root, resolved));
  if (isWithin(process.cwd(), resolved) || synced || /(?:^|[\\/])OneDrive(?: - [^\\/]+)?(?:[\\/]|$)/i.test(resolved)) {
    throw new Error(`${label} must be outside the repository and OneDrive. No financial files were written.`);
  }
  return resolved;
}

function validateKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('The backup key must contain exactly 32 random bytes. Use backup:key to generate it.');
}

export async function generateBackupKey(file: string): Promise<void> {
  const target = privatePath(file, 'Key file');
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, 'wx', 0o600);
  try {
    if (process.platform === 'win32') {
      const identity = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
      const sid = identity.match(/S-\d+(?:-\d+)+/)?.[0];
      if (!sid) throw new Error('Could not identify the Windows account for private key permissions.');
      execFileSync('icacls', [target, '/inheritance:r', '/grant:r', `*${sid}:F`], { stdio: 'ignore', windowsHide: true });
    }
    await handle.writeFile(randomBytes(32));
    await handle.sync();
  } catch {
    await handle.close();
    await unlink(target);
    throw new Error('Could not create a private backup key. Check directory access and Windows ACL permissions.');
  }
  await handle.close();
}

export async function readBackupKey(file: string): Promise<Buffer> {
  const key = await readFile(privatePath(file, 'Key file'));
  validateKey(key);
  return key;
}

export function toolOptions(): PostgresTools {
  const container = process.env.PG_TOOLS_CONTAINER;
  if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('PG_TOOLS_CONTAINER must be a container name or ID.');
  return { container: container || undefined };
}

function toolProcess(tool: string, args: string[], url: URL, options: PostgresTools) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  Object.assign(env, {
    PGHOST: options.container ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: options.container ? '5432' : url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'tracksuite-backup',
  });
  for (const [parameter, variable] of sslOptions) {
    const value = url.searchParams.get(parameter);
    if (value) env[variable] = value;
  }
  if (options.container) env.PGSSLMODE = 'disable';
  const pgKeys = Object.keys(env).filter((key) => key.startsWith('PG'));
  const command = options.container ? 'docker' : tool;
  const commandArgs = options.container
    ? ['exec', '--interactive', ...pgKeys.flatMap((key) => ['--env', key]), options.container, tool, ...args]
    : args;
  const child = spawn(command, commandArgs, {
    env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 600000,
  });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', () => reject(new Error(
      `${command} could not start. Install PostgreSQL client tools, or start Docker and configure PG_TOOLS_CONTAINER.`,
    )));
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(
      `${tool} failed (exit ${code ?? 'interrupted'}). Check database access, permissions and PostgreSQL client/server versions.`,
    )));
  });
  return { child, exited };
}

async function toolText(tool: string, args: string[], url: URL, options: PostgresTools): Promise<string> {
  const { child, exited } = toolProcess(tool, args, url, options);
  let output = '';
  child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-8192); });
  child.stdin.end();
  await exited;
  return output.trim();
}

export async function checkPostgresTools(url: URL, options: PostgresTools): Promise<void> {
  for (const tool of ['pg_dump', 'pg_restore', 'psql']) await toolText(tool, ['--version'], url, options);
}

async function assertSameServer(url: URL, options: PostgresTools): Promise<void> {
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 10000, max: 1 });
  try {
    const expected = (await pool.query<{ marker: string }>(MARKER_SQL)).rows[0].marker;
    const actual = await toolText('psql', ['--no-password', '--no-psqlrc', '--tuples-only', '--no-align', '--command', MARKER_SQL], url, options);
    if (actual !== expected) throw new Error('PostgreSQL tools resolved to a different server/database. Check PG_TOOLS_CONTAINER; no backup or restore was performed.');
  } finally { await pool.end(); }
}

export async function createBackup(source: URL, directory: string, key: Buffer, options: PostgresTools = {}): Promise<string> {
  validateKey(key);
  const target = privatePath(directory, 'Backup directory');
  await assertSameServer(source, options);
  await mkdir(target, { recursive: true, mode: 0o700 });
  const filename = `finance-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomUUID()}.finbackup`;
  const file = path.join(target, filename);
  const partial = `${file}.partial`;
  const handle = await open(partial, 'wx', 0o600);
  const output = handle.createWriteStream({ autoClose: false });
  const iv = randomBytes(IV_LENGTH);
  const header = Buffer.concat([MAGIC, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const { child, exited } = toolProcess('pg_dump', [
    '--no-password', '--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=10000',
  ], source, options);
  child.stdin.end();
  output.write(header);
  const copying = pipeline(child.stdout, cipher, output, { end: false });
  try {
    await Promise.all([copying, exited]);
    output.end(cipher.getAuthTag());
    await finished(output);
    await handle.sync();
    output.destroy();
    await handle.close();
    await rename(partial, file);
    return file;
  } catch (error) {
    child.kill();
    output.destroy();
    await Promise.allSettled([copying, exited, finished(output)]);
    await handle.close();
    await unlink(partial);
    throw error;
  }
}

async function archiveInfo(handle: FileHandle) {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.size <= HEADER_LENGTH + TAG_LENGTH) throw new Error('Backup is empty or truncated.');
  const header = Buffer.alloc(HEADER_LENGTH);
  const tag = Buffer.alloc(TAG_LENGTH);
  await handle.read(header, 0, HEADER_LENGTH, 0);
  await handle.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH);
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not a supported encrypted Track-suite backup.');
  return { header, tag, end: stat.size - TAG_LENGTH - 1 };
}

function decryptor(key: Buffer, info: Awaited<ReturnType<typeof archiveInfo>>) {
  const decipher = createDecipheriv('aes-256-gcm', key, info.header.subarray(MAGIC.length));
  decipher.setAAD(info.header);
  decipher.setAuthTag(info.tag);
  return decipher;
}

async function* encryptedContent(handle: FileHandle, end: number) {
  let position = HEADER_LENGTH;
  while (position <= end) {
    const chunk = Buffer.allocUnsafe(Math.min(65536, end - position + 1));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (!bytesRead) throw new Error('Backup was truncated while reading.');
    position += bytesRead;
    yield chunk.subarray(0, bytesRead);
  }
}

export async function restoreBackup(
  file: string, controlUrl: URL, key: Buffer, options: PostgresTools = {},
): Promise<{ name: string; url: URL }> {
  validateKey(key);
  const handle = await open(path.resolve(file), 'r');
  let control: Pool | undefined;
  let created = false;
  const name = `finance_restore_${randomUUID().replace(/-/g, '')}`;
  const url = new URL(controlUrl);
  url.pathname = `/${name}`;
  try {
    const info = await archiveInfo(handle);
    // Authenticate the entire file before connecting or creating any database. No plaintext temporary file is needed.
    try {
      await pipeline(Readable.from(encryptedContent(handle, info.end)),
        decryptor(key, info), new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
    } catch { throw new Error('Backup authentication failed. The key is wrong or the file is damaged. No database was created.'); }

    await assertSameServer(controlUrl, options);
    control = new Pool({ connectionString: controlUrl.toString(), connectionTimeoutMillis: 10000, max: 1 });
    await control.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    const { child, exited } = toolProcess('pg_restore', [
      '--no-password', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', '--dbname', name,
    ], url, options);
    child.stdout.resume();
    const copying = pipeline(Readable.from(encryptedContent(handle, info.end)), decryptor(key, info), child.stdin);
    try { await Promise.all([copying, exited]); }
    catch (error) {
      child.kill();
      await Promise.allSettled([copying, exited]);
      throw error;
    }
    const restored = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 10000, max: 1 });
    try {
      await restored.query('BEGIN');
      for (const table of ['sessions', 'ingest_tokens', 'login_attempts']) {
        const found = await restored.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
        if (found.rows[0].table_name) await restored.query(`TRUNCATE TABLE public.${table}`);
      }
      await restored.query('COMMIT');
    } finally { await restored.end(); }
    return { name, url };
  } catch (error) {
    if (created) await control!.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    throw error;
  } finally {
    await control?.end();
    await handle.close();
  }
}

export function ensureSeparateKey(directory: string, keyFile: string): void {
  if (isWithin(directory, keyFile)) throw new Error('Keep BACKUP_KEY_FILE outside BACKUP_DIRECTORY and make a separate offline copy of the key.');
}
