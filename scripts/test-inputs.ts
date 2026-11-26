import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountId, ledgerDate, moneyInput } from '../src/lib/money';
import { birthDateInput, queryInteger, timestampInput } from '../src/lib/validation';
import { apiError, BadRequestError } from '../src/lib/errors';
import { databaseUrl, privatePath } from './backup-utils';

test('financial input rejects coercion, non-finite amounts and invalid calendar values', () => {
  for (const value of [true, false, null, [], [1], {}, '', ' ', '0x10', '1e2', NaN, Infinity, -Infinity, 1.001]) {
    assert.throws(() => moneyInput(value, 'Amount'), BadRequestError);
  }
  assert.equal(moneyInput('12.50', 'Amount'), 12.5);
  assert.equal(moneyInput('.25', 'Amount'), 0.25);
  assert.equal(moneyInput('-0.25', 'Correction', { allowNegative: true }), -0.25);
  for (const value of [true, null, [], [1], {}, '1.0', '1e0', '0x1', 0, -1, 1.5]) {
    assert.throws(() => accountId(value), BadRequestError);
  }
  assert.equal(accountId('12'), 12);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '2026-1-01']) {
    assert.throws(() => ledgerDate(date), BadRequestError);
  }
  assert.throws(() => birthDateInput('9999-12-31'), /future/);
  for (const timestamp of ['2026-02-30T12:00:00+03:00', '2026-11-09T25:00:00Z', '2026-11-09T12:00:00', 'not a date']) {
    assert.throws(() => timestampInput(timestamp), BadRequestError);
  }
  assert.equal(timestampInput('2026-11-09T00:01:00+03:00'), '2026-11-09T00:01:00+03:00');
  for (const value of ['', '1e2', '0x10', '-1', '1.5', '9007199254740992']) {
    assert.throws(() => queryInteger(value, 0, 'Page'), BadRequestError);
  }
});

test('database outages return actionable retry responses without database details', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const code of ['ECONNREFUSED', '28P01', '57P01', '53300', '40001']) {
    const response = apiError(Object.assign(new Error('private connection detail'), { code }), 'test');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '5');
    const body = await response.json();
    assert.equal(body.code, 'DATABASE_UNAVAILABLE');
    assert.match(body.error, /PostgreSQL/);
    assert.ok(!body.error.includes('private connection detail'));
  }
  assert.equal(apiError(new SyntaxError('private parser detail'), 'test').status, 400);
  assert.equal(apiError(new Error('Connection terminated due to connection timeout'), 'test').status, 503);
  const outdated = apiError(Object.assign(new Error('private column name'), { code: '42703' }), 'test');
  assert.equal(outdated.status, 503);
  assert.match((await outdated.json()).error, /Back up.*migrate:up/);
});

test('backup configuration refuses ambiguous connection overrides and repository artifacts', () => {
  assert.throws(() => databaseUrl(undefined, 'Test URL'), /explicit PostgreSQL/);
  assert.throws(() => databaseUrl('postgresql://test@localhost/test?dbname=personal', 'Test URL'), /unsupported/);
  assert.throws(() => databaseUrl('postgresql://test@localhost/test?options=-c%20role=postgres', 'Test URL'), /unsupported/);
  assert.throws(() => privatePath(process.cwd(), 'Backup directory'), /outside/);
  assert.throws(() => privatePath('relative-backups', 'Backup directory'), /absolute/);
});
