import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer, type AddressInfo } from 'node:net';
import { withTestDatabase } from './test-db';
import { createIngestToken } from '../src/lib/repo/auth';
import { startApp } from './test-app';

async function json(
  base: string,
  endpoint: string,
  expectedStatus: number,
  options: RequestInit = {},
) {
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.equal(response.status, expectedStatus, `${endpoint}: ${JSON.stringify(data)}`);
  return { response, data };
}

function sessionCookie(response: Response): string {
  const cookie = response.headers.getSetCookie().find((value) =>
    value.startsWith('tracksuite_session='),
  );
  assert.ok(cookie, 'Authentication did not issue a session cookie');
  return cookie.split(';')[0];
}

test('first-run signup, login and accounts survive an application restart', async () => {
  await access(path.resolve('.next', 'BUILD_ID')).catch(() => {
    throw new Error('A production build is required. Run npm run build before test:startup.');
  });
  await withTestDatabase(async ({ pool }) => {
    const credentials = {
      email: `${randomUUID()}@example.invalid`,
      password: randomUUID(),
      full_name: 'Startup Test User',
    };
    let server = await startApp();
    try {
      const signupPage = await fetch(`${server.base}/signup`, {
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(signupPage.status, 200);
      assert.match(await signupPage.text(), /signup-form/);
      await json(server.base, '/api/transactions?type=accounts', 401);
      const signup = await json(server.base, '/api/auth/signup', 201, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const firstCookie = sessionCookie(signup.response);
      assert.equal(signup.data.user.email, credentials.email);
      assert.equal(
        (await json(server.base, '/api/transactions?type=accounts', 200, {
          headers: { Cookie: firstCookie },
        })).data.accounts.length,
        0,
        'A new user must not receive demo accounts',
      );
      const created = await json(server.base, '/api/transactions', 200, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: firstCookie },
        body: JSON.stringify({
          type: 'new_account',
          name: 'Startup Test Wallet',
          institution: 'Test',
          account_type: 'cash',
          currency: 'KES',
          balance: 123.45,
        }),
      });
      const accountId = created.data.account.id;
      await json(server.base, '/api/auth/logout', 200, {
        method: 'POST', headers: { Cookie: firstCookie },
      });
      await json(server.base, '/api/auth/me', 401, { headers: { Cookie: firstCookie } });
      const login = await json(server.base, '/api/auth/login', 200, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      const cookie = sessionCookie(login.response);
      await server.stop();
      server = await startApp();

      const profile = await json(server.base, '/api/auth/me', 200, {
        headers: { Cookie: cookie },
      });
      assert.equal(profile.data.user.id, signup.data.user.id);
      const saved = await json(server.base, '/api/transactions?type=accounts', 200, {
        headers: { Cookie: cookie },
      });
      assert.equal(saved.data.accounts.length, 1);
      assert.equal(saved.data.accounts[0].id, accountId);
      assert.equal(saved.data.accounts[0].balance, 123.45);
      const metrics = await json(server.base, '/api/networth', 200, {
        headers: { Cookie: cookie },
      });
      assert.equal(metrics.data.netWorth, 123.45);
      assert.equal(metrics.data.isDatabaseConnected, true);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count, 1);

      const post = (body: object, status = 200) => json(server.base, '/api/transactions', status, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      });
      const destination = await post({
        type: 'new_account', name: 'Destination wallet', account_type: 'cash', balance: 0,
      });
      const destinationId = destination.data.account.id;
      const transfer = await post({
        account_id: accountId, transfer_account_id: destinationId,
        type: 'transfer', amount: '20.00', fee_amount: '1.25', description: 'Move own money',
      });
      assert.equal(transfer.data.transaction.transfer_account_id, destinationId);
      assert.equal(transfer.data.transaction.fee_amount, 1.25);
      const destinationHistory = await json(server.base, `/api/transactions?accountId=${destinationId}`, 200, {
        headers: { Cookie: cookie },
      });
      assert.equal(destinationHistory.data.transactions.length, 1);
      await post({ type: 'new_account', name: 'Unsupported FX', balance: 0, currency: 'USD' }, 400);
      await post({ account_id: accountId, type: 'expense', amount: -1, description: 'Invalid' }, 400);
      await post({ account_id: accountId, type: 'transfer', amount: 1, description: 'No destination' }, 400);
      const invalidRequests: Array<[string, string, unknown]> = [
        ['/api/auth/login', 'POST', null],
        ['/api/auth/login', 'POST', []],
        ['/api/auth/login', 'POST', { email: 123, password: 'valid-length' }],
        ['/api/auth/login', 'POST', { email: credentials.email, password: {} }],
        ['/api/auth/signup', 'POST', null],
        ['/api/auth/signup', 'POST', { ...credentials, email: [] }],
        ['/api/auth/signup', 'POST', { ...credentials, full_name: 123 }],
        ['/api/auth/signup', 'POST', { ...credentials, dob: '2026-02-30' }],
        ['/api/auth/signup', 'POST', { ...credentials, country: true }],
        ['/api/transactions', 'POST', { type: 'new_account', name: 'Invalid opening', balance: true }],
        ['/api/transactions', 'POST', { type: 'new_account', name: 'Invalid opening', balance: [] }],
        ['/api/transactions', 'POST', { type: 'new_account', name: 'Invalid opening', balance: '0x10' }],
        ['/api/transactions', 'POST', { type: 'new_account', name: 'Invalid retry key', request_id: 1 }],
        ['/api/transactions', 'POST', { account_id: [accountId], amount: 1, description: 'Invalid account' }],
        ['/api/transactions', 'POST', { account_id: accountId, amount: true, description: 'Invalid amount' }],
        ['/api/transactions', 'POST', { account_id: accountId, amount: [1], description: 'Invalid amount' }],
        ['/api/transactions', 'POST', { account_id: accountId, amount: null, description: 'Invalid amount' }],
        ['/api/transactions', 'POST', { account_id: accountId, amount: 1, date: '2026-02-30', description: 'Invalid date' }],
        ['/api/transactions', 'POST', { account_id: accountId, amount: 1, type: 'not-a-type', description: 'Invalid type' }],
        ['/api/transactions', 'PATCH', { type: 'account_identifier', account_id: [accountId], account_identifier: '1234' }],
        ['/api/goals', 'POST', { name: 'Invalid target', target_amount: true }],
        ['/api/goals', 'POST', { name: 'Invalid saved', target_amount: 10, current_amount: false }],
        ['/api/assets-liabilities', 'POST', { kind: 'asset', name: 'Invalid asset', estimated_value: [1] }],
        ['/api/assets-liabilities', 'POST', { kind: 'liability', name: 'Invalid debt', interest_rate: true }],
        ['/api/budgets', 'POST', { category: 'Other', monthly_limit: false }],
        ['/api/ingest-tokens', 'POST', { label: {} }],
        ['/api/import/statement', 'POST', { accountId, rawText: {}, format: 'sms' }],
        ['/api/import/statement', 'POST', { accountId: [accountId], rawText: 'text' }],
        ['/api/profile', 'PUT', { full_name: false }],
        ['/api/profile', 'PUT', { dob: '9999-12-31' }],
      ];
      for (const [endpoint, method, body] of invalidRequests) {
        await json(server.base, endpoint, 400, {
          method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
        });
      }
      for (const endpoint of ['/api/transactions?limit=1e2', '/api/transactions?type=invalid', '/api/history?entity=account&id=1&page=0x1', '/api/import/statement?page=']) {
        await json(server.base, endpoint, 400, { headers: { Cookie: cookie } });
      }

      const importStatement = (body: object, status = 200, method = 'POST') => json(server.base, '/api/import/statement', status, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
      });
      const source = { accountId, rawText: 'QHL921KK89 Confirmed. Ksh20.00 sent to JOHN DOE on 22/10/26 at 11:45 AM. Transaction cost, Ksh1.25.' };
      const batch = (await importStatement(source)).data.batch;
      assert.equal(batch.status, 'preview');
      assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [accountId])).rows[0].current_balance, '102.20');
      const decisions = batch.rows.map((row: { row: number }) => ({ row: row.row, decision: 'import', reviewed: true }));
      await importStatement({ action: 'commit', batchId: batch.id, rows: decisions }, 400);
      const confirmation = { action: 'commit', batchId: batch.id, rows: decisions, confirm: true };
      assert.equal((await importStatement(confirmation)).data.imported, 1);
      assert.equal((await importStatement(confirmation)).data.imported, 1);
      const duplicateBatch = (await importStatement(source)).data.batch;
      const duplicate = await importStatement({ ...confirmation, batchId: duplicateBatch.id });
      assert.equal(duplicate.data.imported, 0);
      assert.equal(duplicate.data.duplicates, 1);
      await importStatement({ action: 'reverse', batchId: batch.id }, 400, 'DELETE');
      const reversalPreview = await json(server.base, `/api/import/statement?id=${batch.id}&reversal=true`, 200, { headers: { Cookie: cookie } });
      assert.equal(reversalPreview.data.balances[0].change, 21.25);
      assert.equal((await importStatement({ action: 'reverse', batchId: batch.id, confirm: true }, 200, 'DELETE')).data.batch.status, 'reversed');
      assert.equal((await importStatement({ action: 'reverse', batchId: batch.id, confirm: true }, 200, 'DELETE')).data.batch.status, 'reversed');
      const reimport = (await importStatement(source)).data.batch;
      assert.equal((await importStatement({ ...confirmation, batchId: reimport.id })).data.imported, 1);
      const pending = (await importStatement({ ...source, sourceName: 'Discard test' })).data.batch;
      await importStatement({ action: 'discard', batchId: pending.id }, 200, 'DELETE');
      const history = await json(server.base, '/api/import/statement', 200, { headers: { Cookie: cookie } });
      assert.equal(history.data.batches.length, 3);
      const adjustment = await post({
        type: 'reconcile_account', account_id: accountId, actual_balance: '100.10', reason: 'Statement closing balance',
      });
      assert.equal(adjustment.data.adjustment.type, 'adjustment');
      assert.equal(adjustment.data.adjustment.amount, 19.15);
      const finalAccounts = (await json(server.base, '/api/transactions?type=accounts', 200, {
        headers: { Cookie: cookie },
      })).data.accounts;
      assert.equal(finalAccounts.find((a: { id: number }) => a.id === accountId).balance, 100.10);
      assert.equal(finalAccounts.find((a: { id: number }) => a.id === destinationId).balance, 20);
      assert.equal(finalAccounts.find((a: { id: number }) => a.id === accountId).opening_balance, 123.45);

      await json(server.base, '/api/import/statement', 401);
      const bank = (await post({
        type: 'new_account', name: 'KCB bank', institution: 'KCB', account_type: 'bank_checking',
        balance: 0, account_identifier: '00001234',
      })).data.account;
      const token = await createIngestToken(signup.data.user.id, 'HTTP import check');
      const forward = (body: object, status: number) => json(server.base, '/api/ingest/sms', status, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.token}` },
        body: JSON.stringify(body),
      });
      const message = 'KCB salary: KES 50.00 credited to account 1234 on 2026-10-22 at 09:15. Ref HTTPBK01. Balance KES 50.00.';
      const delivery = { message, receivedAt: '2026-10-22T09:15:00+03:00' };
      assert.equal((await forward(delivery, 201)).data.account.id, bank.id);
      assert.equal((await forward(delivery, 200)).data.duplicate, true);
      const queued = await forward({ ...delivery, message: message.replace('salary:', 'alert:').replace('HTTPBK01', 'HTTPBK02') }, 202);
      assert.equal(queued.data.needsReview, true);
      const review = await json(server.base, `/api/import/statement?id=${queued.data.batchId}`, 200, { headers: { Cookie: cookie } });
      assert.equal(review.data.batch.status, 'preview');
      assert.equal(review.data.batch.rows[0].needsReview, true);
      assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [bank.id])).rows[0].current_balance, '50.00');
      await forward({ ...delivery, receivedAt: 'not a timestamp' }, 400);
      await forward({ ...delivery, receivedAt: '2026-02-30T12:00:00+03:00' }, 400);
      await forward({ ...delivery, accountId: [bank.id] }, 400);
      await forward({ ...delivery, counterpartAccountId: false }, 400);
      const identifier = await json(server.base, '/api/transactions', 200, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ type: 'account_identifier', account_id: bank.id, account_identifier: 'xx5678' }),
      });
      assert.equal(identifier.data.account.account_identifier, '5678');
      assert.equal(identifier.data.account.balance, 50);

      const request = (endpoint: string, method: string, body: object, status = 200) => json(server.base, endpoint, status, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
      });
      const accountEdit = {
        ...identifier.data.account, type: 'account', name: 'Renamed bank',
        reason: 'Correct bank name',
      };
      delete accountEdit.balance;
      delete accountEdit.opening_balance;
      const renamed = (await request('/api/transactions', 'PATCH', accountEdit)).data.account;
      assert.equal(renamed.name, 'Renamed bank');
      assert.equal(renamed.balance, 50);
      await request('/api/transactions', 'PATCH', accountEdit, 409);
      await request('/api/transactions', 'PATCH', { ...accountEdit, version: renamed.version, balance: 0 }, 400);
      const editable = (await post({
        account_id: accountId, type: 'expense', amount: 5, fee_amount: 1, category: 'Shopping', description: 'Editable expense',
      })).data.transaction;
      const budget = (await request('/api/budgets', 'POST', { category: 'Shopping', monthly_limit: 4 })).data.budget;
      const actuals = (await json(server.base, '/api/budgets', 200, { headers: { Cookie: cookie } })).data.budgets[0];
      assert.equal(actuals.actual_spending, 5);
      assert.equal(actuals.remaining, -1);
      assert.equal(actuals.overspent, true);
      const edited = (await request('/api/transactions', 'PATCH', {
        action: 'edit', id: editable.id, version: editable.version, reason: 'Actually a reimbursement',
        type: 'income', amount: 10, fee_amount: 0,
      })).data.transaction;
      const txHistory = (await json(server.base, `/api/history?entity=transaction&id=${editable.id}`, 200,
        { headers: { Cookie: cookie } })).data.entries;
      assert.equal(txHistory[0].reason, 'Actually a reimbursement');
      assert.equal(txHistory[0].before.amount, 5);
      assert.equal(txHistory[0].after.amount, 10);
      await request('/api/transactions', 'PATCH', { action: 'edit', id: edited.id, version: editable.version, amount: 2, reason: 'Stale' }, 409);
      await request('/api/transactions', 'DELETE', { id: edited.id, version: edited.version, reason: 'Duplicate entry' }, 400);
      await request('/api/transactions', 'DELETE', { id: edited.id, version: edited.version, reason: 'Duplicate entry', confirm: true });
      const paged = await json(server.base, '/api/transactions?limit=1&offset=0&transactionType=transfer', 200, { headers: { Cookie: cookie } });
      assert.equal(paged.data.transactions[0].type, 'transfer');
      assert.equal(paged.data.total, 1);
      await json(server.base, '/api/transactions?offset=-1', 400, { headers: { Cookie: cookie } });
      await json(server.base, '/api/transactions?limit=1oops', 400, { headers: { Cookie: cookie } });
      assert.ok((await json(server.base, '/api/categories', 200, { headers: { Cookie: cookie } })).data.categories
        .some((category: { name: string }) => category.name === 'Shopping & Essentials'));
      const revisedBudget = (await request('/api/budgets', 'PATCH', {
        ...budget, monthly_limit: 20, reason: 'Raise allowance',
      })).data.budget;
      await request('/api/budgets', 'DELETE', { id: budget.id, version: revisedBudget.version, reason: 'Retire limit', confirm: true });

      const assetInput = { kind: 'asset', name: 'Test bike', category: 'vehicle', estimated_value: 250, request_id: randomUUID() };
      const asset = (await request('/api/assets-liabilities', 'POST', assetInput)).data.asset;
      assert.equal((await request('/api/assets-liabilities', 'POST', assetInput)).data.asset.id, asset.id);
      assert.equal((await request('/api/assets-liabilities', 'PATCH', {
        ...asset, kind: 'asset', estimated_value: 200, reason: 'Updated valuation',
      })).data.asset.estimated_value, 200);
      const debtInput = { kind: 'liability', name: 'Test debt', category: 'personal_loan', principal_amount: 50, outstanding_balance: 40, request_id: randomUUID() };
      const debt = (await request('/api/assets-liabilities', 'POST', debtInput)).data.liability;
      assert.equal((await request('/api/assets-liabilities', 'POST', debtInput)).data.liability.id, debt.id);
      assert.equal((await request('/api/assets-liabilities', 'PATCH', {
        ...debt, kind: 'liability', outstanding_balance: 0, reason: 'Closing statement',
      })).data.liability.outstanding_balance, 0);
      const goalInput = { name: 'Test goal', target_amount: 100, current_amount: 10, request_id: randomUUID() };
      const goal = (await request('/api/goals', 'POST', goalInput)).data.goal;
      assert.equal((await request('/api/goals', 'POST', goalInput)).data.goal.id, goal.id);
      const contribution = { action: 'contribute', id: goal.id, version: goal.version, request_id: randomUUID(), amount: 7.5, note: 'Earmark', date: '2026-11-09' };
      const contributed = (await request('/api/goals', 'POST', contribution)).data.goal;
      assert.equal(contributed.current_amount, 17.5);
      assert.equal((await request('/api/goals', 'POST', contribution)).data.isDuplicate, true);
      const released = (await request('/api/goals', 'POST', {
        ...contribution, amount: -2.5, version: contributed.version, request_id: randomUUID(), note: 'Release',
      })).data.goal;
      assert.equal(released.current_amount, 15);
      await request('/api/goals', 'PATCH', { ...released, current_amount: 0, reason: 'Bypass history' }, 400);
      const goalChange = { ...released, name: 'Updated goal', target_date: '2027-01-01', reason: 'Extend target' };
      delete goalChange.current_amount;
      assert.equal((await request('/api/goals', 'PATCH', goalChange)).data.goal.current_amount, 15);
      assert.equal((await json(server.base, `/api/goals?id=${goal.id}`, 200, { headers: { Cookie: cookie } })).data.contributions.length, 3);
      const profileChange = await request('/api/profile', 'PUT', { full_name: 'Updated Test User', phone_number: '', country: 'KE', dob: '' });
      assert.equal(profileChange.data.user.full_name, 'Updated Test User');
      assert.equal(profileChange.data.user.dob, null);
      const exported = await json(server.base, '/api/export', 200, { headers: { Cookie: cookie } });
      assert.equal(exported.data.owner_user_id, signup.data.user.id);
      assert.match(exported.response.headers.get('cache-control') || '', /no-store/);
      assert.match(exported.response.headers.get('content-disposition') || '', /attachment/);
      assert.ok(exported.data.records.transactions.length > 0);
      assert.ok(!('users' in exported.data.records));
      assert.ok(!('sessions' in exported.data.records));
      await json(server.base, '/api/export', 401);
      assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [accountId])).rows[0].current_balance, '100.10');
      await pool.query("UPDATE sessions SET expires_at='2000-01-01' WHERE id=$1", [cookie.split('=')[1]]);
      const expired = await json(server.base, '/api/transactions?type=accounts', 401, { headers: { Cookie: cookie } });
      assert.match(expired.response.headers.get('set-cookie') || '', /tracksuite_session=;.*Max-Age=0/i);
      await json(server.base, '/api/auth/me', 401, { headers: { Cookie: cookie } });
      const staleLogin = await fetch(`${server.base}/login`, {
        headers: { Cookie: cookie }, redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
      assert.equal(staleLogin.status, 200, 'A stale cookie must not redirect away from login');
      assert.match(staleLogin.headers.get('content-type') || '', /text\/html/);
      await staleLogin.body?.cancel();
    } finally {
      await server.stop();
    }
  });
});

test('database connection failure is actionable and does not take down the application', { timeout: 60000 }, async () => {
  await withTestDatabase(async () => {
    const disconnected = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => disconnected.listen(0, '127.0.0.1', resolve));
    const url = new URL(process.env.DATABASE_URL!);
    url.hostname = '127.0.0.1';
    url.port = String((disconnected.address() as AddressInfo).port);
    let server: Awaited<ReturnType<typeof startApp>> | undefined;
    try {
      server = await startApp(url.toString());
      const failed = await json(server.base, '/api/auth/login', 503, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'outage@example.invalid', password: 'fictional-password' }),
      });
      assert.equal(failed.data.code, 'DATABASE_UNAVAILABLE');
      assert.equal(failed.response.headers.get('Retry-After'), '5');
      assert.match(failed.data.error, /retry the same form/);
      assert.ok(!JSON.stringify(failed.data).includes('testpassword'));
      assert.equal((await fetch(`${server.base}/login`)).status, 200);
    } finally {
      await server?.stop();
      await new Promise<void>((resolve, reject) => disconnected.close((error) => error ? reject(error) : resolve()));
    }
  });
});
