import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { closePool, getPool } from '../src/lib/db';
import { loadLocalEnv } from './load-env';

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function databaseIdentity(url: URL): string {
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ? 'loopback'
    : url.hostname;
  return `${host}:${url.port || '5432'}/${databaseName(url)}`;
}

export function validateTestDatabaseUrl(
  value: string | undefined,
  applicationUrl?: string,
): URL {
  if (!value?.trim()) {
    throw new Error('TEST_DATABASE_URL is required. Tests never fall back to DATABASE_URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL connection URL.');
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*_test$/.test(databaseName(url))) {
    throw new Error('TEST_DATABASE_URL must name a dedicated database ending in _test.');
  }
  for (const key of url.searchParams.keys()) {
    if (!['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].includes(key)) {
      throw new Error('TEST_DATABASE_URL contains unsupported connection overrides.');
    }
  }
  if (applicationUrl && databaseIdentity(url) === databaseIdentity(new URL(applicationUrl))) {
    throw new Error('TEST_DATABASE_URL must not point to the application database.');
  }
  return url;
}

export function getTestDatabaseUrl(): URL {
  loadLocalEnv();
  return validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
}

interface TestDatabase {
  pool: Pool;
  name: string;
}

export async function withTestDatabase<T>(
  run: (database: TestDatabase) => Promise<T>,
): Promise<T> {
  const baseUrl = getTestDatabaseUrl();
  const originalUrl = process.env.DATABASE_URL;
  const name = `finance_test_${randomUUID().replace(/-/g, '')}`;
  const isolatedUrl = new URL(baseUrl);
  isolatedUrl.pathname = `/${name}`;
  const control = new Pool({
    connectionString: baseUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  let created = false;
  let testPool: Pool | undefined;
  const disconnections: Promise<void>[] = [];

  try {
    const current = await control.query<{ name: string }>('SELECT current_database() AS name');
    if (current.rows[0].name !== databaseName(baseUrl)) {
      throw new Error('Test connection resolved to an unexpected database.');
    }
    await control.query(`CREATE DATABASE "${name}"`);
    created = true;
    process.env.DATABASE_URL = isolatedUrl.toString();

    const pool = getPool();
    if (pool.options.connectionString !== isolatedUrl.toString()) {
      throw new Error('The database pool was initialized before test isolation.');
    }
    testPool = pool;
    pool.on('connect', (client) => {
      disconnections.push(new Promise<void>((resolve) => client.once('end', () => resolve())));
    });
    await runner({
      databaseUrl: isolatedUrl.toString(),
      dir: path.resolve('migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      ignorePattern: '^schema\\.sql$',
      log: () => {},
    });
    return await run({ pool, name });
  } finally {
    try {
      if (testPool) {
        await closePool();
        // pg-pool can finish end() before its individual sockets have closed.
        await Promise.all(disconnections);
      }
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
      try {
        // Only this invocation's randomly named database can be dropped.
        if (created) await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await control.end();
      }
    }
  }
}

export async function createTestUser(pool: Pool): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (email, full_name)
     VALUES ($1, $2) RETURNING id`,
    [`${randomUUID()}@example.invalid`, 'Test User'],
  );
  return result.rows[0].id;
}
