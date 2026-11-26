import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import {
  createTestUser,
  getTestDatabaseUrl,
  validateTestDatabaseUrl,
  withTestDatabase,
} from './test-db';

test('database URL guard refuses unsafe targets before connecting', () => {
  const application = 'postgresql://user:password@localhost:5433/financial_dashboard';
  for (const value of [
    undefined,
    '',
    application,
    'not-a-url',
    'https://localhost/dashboard_test',
    'postgresql:///dashboard_test',
    'postgresql://localhost/postgres',
    'postgresql://localhost/dashboard_test?dbname=financial_dashboard',
    'postgresql://localhost/dashboard_test?host=another-server',
    'postgresql://localhost/dashboard_test?options=-c%20search_path=public',
  ]) {
    assert.throws(() => validateTestDatabaseUrl(value, application));
  }
  assert.throws(
    () => validateTestDatabaseUrl(
      'postgresql://test:password@127.0.0.1:5432/dashboard_test',
      'postgres://app:password@localhost/dashboard_test',
    ),
    /application database/,
  );
  assert.equal(
    validateTestDatabaseUrl(
      'postgresql://user:password@localhost:5434/dashboard_test?sslmode=disable',
      application,
    ).pathname,
    '/dashboard_test',
  );
});

test('isolated databases are migrated and removed after success and failure', async () => {
  const baseUrl = getTestDatabaseUrl();
  const originalUrl = process.env.DATABASE_URL;
  const control = new Pool({
    connectionString: baseUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  const names: string[] = [];
  const cleanupErrors: Error[] = [];
  const assertRemoved = async (name: string) => {
    const result = await control.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    assert.equal(result.rowCount, 0, `Temporary database ${name} was not removed`);
    assert.equal(process.env.DATABASE_URL, originalUrl);
  };

  try {
    await withTestDatabase(async ({ pool, name }) => {
      names.push(name);
      pool.on('error', (error) => cleanupErrors.push(error));
      const idleClients = await Promise.all([pool.connect(), pool.connect(), pool.connect()]);
      idleClients.forEach((client) => client.release());
      const result = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'`,
      );
      assert.ok(result.rows.some((row) => row.column_name === 'password_hash'));
      await createTestUser(pool);
      await pool.query('CREATE TABLE cleanup_probe (id INTEGER)');
    });
    await assertRemoved(names[0]);
    assert.deepEqual(cleanupErrors, [], 'Cleanup must close idle sockets before dropping their database');

    const failure = new Error('Intentional test failure');
    await assert.rejects(withTestDatabase(async ({ pool, name }) => {
      names.push(name);
      assert.notEqual(name, names[0]);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 0);
      await createTestUser(pool);
      throw failure;
    }), failure);
    await assertRemoved(names[1]);
  } finally {
    await control.end();
  }
});
