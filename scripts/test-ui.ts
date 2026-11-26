import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { chromium, type Locator, type Page } from 'playwright';
import { withTestDatabase } from './test-db';
import { startApp } from './test-app';

async function save(page: Page, form: Locator, endpoint: string, method: string, button: string) {
  const [response] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === endpoint && response.request().method() === method),
    form.getByRole('button', { name: button, exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, await response.text());
  await form.waitFor({ state: 'hidden' });
}

test('ordinary financial maintenance, errors and expired sessions work through the browser', { timeout: 180000 }, async (t) => {
  await access(path.resolve('.next', 'BUILD_ID'));
  await withTestDatabase(async ({ pool }) => {
    const server = await startApp();
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ baseURL: server.base, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const credentials = { email: `${randomUUID()}@example.invalid`, password: randomUUID(), full_name: 'Browser Test User' };
      const signup = await context.request.post('/api/auth/signup', { data: credentials });
      assert.equal(signup.status(), 201);
      const user = (await signup.json()).user;
      try {
        await page.goto('/');
        await page.getByText('Real-Time Net Worth', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Accounts & Wallets', exact: true }).click();
        await page.getByRole('button', { name: /Add New Account/ }).click();
        let form = page.getByRole('form', { name: 'Create account' });
        await form.getByLabel('Account name', { exact: true }).fill('Daily cash');
        await form.getByLabel('Account type', { exact: true }).selectOption('cash');
        await form.getByLabel('Opening balance', { exact: true }).fill('1000');
        let interrupted = false;
        await page.route('**/api/transactions', async (route) => {
          if (!interrupted && route.request().method() === 'POST' && route.request().postDataJSON().type === 'new_account') {
            interrupted = true;
            const response = await route.fetch();
            assert.equal(response.status(), 200);
            await response.body();
            await route.abort('failed');
          } else await route.continue();
        });
        await form.getByRole('button', { name: 'Create Account', exact: true }).click();
        await form.getByRole('alert').getByText(/Could not confirm the request/).waitFor();
        await save(page, form, '/api/transactions', 'POST', 'Create Account');
        await page.unroute('**/api/transactions');
        await page.getByRole('heading', { name: 'Daily cash', exact: true }).waitFor();
        assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM accounts WHERE user_id=$1', [user.id])).rows[0].count, 1);
        const account = (await pool.query('SELECT id FROM accounts WHERE user_id=$1', [user.id])).rows[0];

        await page.locator('#btn-add-tx').click();
        form = page.getByRole('form', { name: 'Record transaction' });
        await form.getByLabel('Transaction amount', { exact: true }).fill('12.50');
        await form.getByLabel('Transaction fee', { exact: true }).fill('1');
        await form.getByLabel('Transaction description', { exact: true }).fill('Groceries');
        await save(page, form, '/api/transactions', 'POST', 'Save Transaction');
        await page.getByRole('button', { name: 'Transactions', exact: true }).click();
        let row = page.getByRole('row').filter({ hasText: 'Groceries' });
        await row.getByRole('button', { name: 'Edit / Reverse', exact: true }).click();
        let dialog = page.getByRole('dialog', { name: 'Edit transaction', exact: true });
        await dialog.getByLabel('Principal amount (KES)', { exact: true }).fill('20.25');
        await dialog.getByLabel('Linked fee (KES)', { exact: true }).fill('2');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Correct receipt amount');
        await save(page, dialog, '/api/transactions', 'PATCH', 'Save changes');
        await row.getByRole('button', { name: 'History', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'History: Groceries', exact: true });
        await dialog.getByText('Correct receipt amount', { exact: true }).waitFor();
        assert.match(await dialog.innerText(), /12\.5/);
        assert.match(await dialog.innerText(), /20\.25/);
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();

        await page.getByRole('button', { name: 'Accounts & Wallets', exact: true }).click();
        await page.getByRole('button', { name: 'Edit account', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit account', exact: true });
        await dialog.getByLabel('Account name', { exact: true }).fill('Daily wallet');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Rename cash wallet');
        await save(page, dialog, '/api/transactions', 'PATCH', 'Save changes');
        await page.getByRole('heading', { name: 'Daily wallet', exact: true }).waitFor();
        assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [account.id])).rows[0].current_balance, '977.75');

        await page.getByRole('button', { name: 'Assets & Debts', exact: true }).click();
        await page.getByRole('button', { name: '+ Add Asset', exact: true }).click();
        form = page.getByRole('form', { name: 'Create asset' });
        await form.getByLabel('Asset name', { exact: true }).fill('Test bike');
        await form.getByLabel('Asset valuation', { exact: true }).fill('100.50');
        await save(page, form, '/api/assets-liabilities', 'POST', 'Save Asset to Balance Sheet');
        let card = page.locator('div').filter({ has: page.getByText('Test bike', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Edit', exact: true }) }).last();
        await card.getByRole('button', { name: 'Edit', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit asset', exact: true });
        await dialog.getByLabel('Estimated value (KES)', { exact: true }).fill('90.25');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Updated bike valuation');
        await save(page, dialog, '/api/assets-liabilities', 'PATCH', 'Save changes');
        await page.getByRole('button', { name: '+ Add Debt / Loan', exact: true }).click();
        form = page.getByRole('form', { name: 'Create liability' });
        await form.getByLabel('Liability name', { exact: true }).fill('Test loan');
        await form.getByLabel('Outstanding balance', { exact: true }).fill('50.25');
        await save(page, form, '/api/assets-liabilities', 'POST', 'Record Liability');
        card = page.locator('div').filter({ has: page.getByText('Test loan', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Edit', exact: true }) }).last();
        await card.getByRole('button', { name: 'Edit', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit liability', exact: true });
        await dialog.getByLabel('Outstanding balance (KES)', { exact: true }).fill('0');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Closing loan statement');
        await save(page, dialog, '/api/assets-liabilities', 'PATCH', 'Save changes');

        await page.getByRole('button', { name: 'Budgets & Goals', exact: true }).click();
        await page.getByRole('button', { name: '+ New savings goal', exact: true }).click();
        form = page.getByRole('form', { name: 'Create savings goal' });
        await form.getByLabel('Goal name', { exact: true }).fill('Emergency fund');
        await form.getByLabel('Goal target', { exact: true }).fill('100');
        await form.getByLabel('Initial earmark', { exact: true }).fill('5.25');
        await save(page, form, '/api/goals', 'POST', 'Create Goal');
        await page.getByRole('button', { name: 'Earmark / Release & history', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Emergency fund: earmarks', exact: true });
        await dialog.getByLabel('Custom amount (KES)', { exact: true }).fill('14.75');
        await dialog.getByLabel('Note (optional)', { exact: true }).fill('Custom allocation');
        await Promise.all([
          page.waitForResponse((response) => response.url().endsWith('/api/goals') && response.request().method() === 'POST'),
          dialog.getByRole('button', { name: 'Record allocation change', exact: true }).click(),
        ]);
        await dialog.getByText('Custom allocation', { exact: true }).waitFor();
        await dialog.getByLabel('Action', { exact: true }).selectOption('release');
        await dialog.getByLabel('Custom amount (KES)', { exact: true }).fill('5');
        await dialog.getByLabel('Note (optional)', { exact: true }).fill('Release correction');
        await Promise.all([
          page.waitForResponse((response) => response.url().endsWith('/api/goals') && response.request().method() === 'POST'),
          dialog.getByRole('button', { name: 'Record allocation change', exact: true }).click(),
        ]);
        await dialog.getByText('Release correction', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        card = page.getByRole('article').filter({ hasText: 'Emergency fund' });
        await card.getByRole('button', { name: 'Edit', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit goal', exact: true });
        await dialog.getByLabel('Target amount (KES)', { exact: true }).fill('120');
        await dialog.getByLabel('Target date', { exact: true }).fill('2027-01-01');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Extend target');
        await save(page, dialog, '/api/goals', 'PATCH', 'Save changes');
        assert.equal((await pool.query('SELECT current_amount FROM savings_goals WHERE user_id=$1', [user.id])).rows[0].current_amount, '15.00');
        assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [account.id])).rows[0].current_balance, '977.75');
        await page.getByRole('button', { name: '+ Create budget', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Create budget', exact: true });
        await dialog.getByLabel('Recurring monthly limit (KES)', { exact: true }).fill('20');
        await save(page, dialog, '/api/budgets', 'POST', 'Create budget');
        card = page.getByRole('article').filter({ hasText: 'Food & Groceries' });
        await card.getByText(/Overspent by/).waitFor();
        await card.getByRole('button', { name: 'Edit / Retire', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit budget', exact: true });
        await dialog.getByLabel('Recurring monthly limit (KES)', { exact: true }).fill('30');
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Raise allowance');
        await save(page, dialog, '/api/budgets', 'PATCH', 'Save changes');
        await card.getByText(/remaining/).waitFor();
        assert.match(await card.innerText(), /9\.75/);

        await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category,import_source)
          SELECT $1,$2,1,'expense','2000-01-01','Archive entry ' || g,'Other','manual' FROM generate_series(1,225) g`, [user.id, account.id]);
        await pool.query('UPDATE accounts SET current_balance=current_balance-225 WHERE id=$1', [account.id]);
        await page.getByRole('button', { name: 'Transactions', exact: true }).click();
        await page.getByText(/Page 1 \| 227 matching transactions/).waitFor();
        for (let pageNumber = 2; pageNumber <= 5; pageNumber++) {
          await page.getByRole('button', { name: 'Next', exact: true }).click();
          await page.getByText(`Page ${pageNumber} | 227 matching transactions`, { exact: true }).waitFor();
        }
        await page.getByRole('cell', { name: 'Archive entry 1', exact: true }).waitFor();
        await page.getByLabel('Search transaction history', { exact: true }).fill('Groceries');
        await page.getByText('Page 1 | 1 matching transactions', { exact: true }).waitFor();
        row = page.getByRole('row').filter({ hasText: 'Groceries' });
        await row.getByRole('button', { name: 'Edit / Reverse', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Edit transaction', exact: true });
        await dialog.getByRole('button', { name: 'Reverse this transaction and linked fee', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'Reverse transaction', exact: true });
        await dialog.getByLabel('I reviewed these balance changes.', { exact: true }).check();
        await dialog.getByLabel('Reason for this change (retained in history)', { exact: true }).fill('Erroneous manual record');
        await save(page, dialog, '/api/transactions', 'DELETE', 'Confirm reversal');
        await page.getByText('Page 1 | 0 matching transactions', { exact: true }).waitFor();
        await page.getByLabel('Filter transaction status', { exact: true }).selectOption('reversed');
        await row.getByRole('button', { name: 'History', exact: true }).click();
        dialog = page.getByRole('dialog', { name: 'History: Groceries', exact: true });
        await dialog.getByText('Erroneous manual record', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        assert.equal((await pool.query('SELECT current_balance FROM accounts WHERE id=$1', [account.id])).rows[0].current_balance, '775.00');

        await page.route('**/api/networth', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Simulated database outage"}' }));
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await page.getByRole('heading', { name: 'Financial data could not be loaded', exact: true }).waitFor();
        assert.equal(await page.getByText('Real-Time Net Worth', { exact: true }).count(), 0);
        await page.unroute('**/api/networth');
        await page.getByRole('button', { name: 'Retry loading dashboard', exact: true }).click();
        await page.getByLabel('Search transaction history', { exact: true }).waitFor();
        await page.getByRole('link', { name: 'Settings / Profile', exact: true }).click();
        await page.getByLabel('Full name', { exact: true }).fill('Updated Browser User');
        await page.getByRole('button', { name: 'Save profile', exact: true }).click();
        await page.getByText('Profile saved.', { exact: true }).waitFor();
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: 'Download financial data (JSON)', exact: true }).click(),
        ]);
        assert.match(download.suggestedFilename(), /^finance-export-\d{4}-\d{2}-\d{2}\.json$/);
        const stream = await download.createReadStream();
        assert.ok(stream);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const financialExport = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert.equal(financialExport.owner_user_id, user.id);
        assert.equal(financialExport.records.transactions.length, 227);
        assert.ok(!('sessions' in financialExport.records));
        await page.getByRole('link', { name: 'SMS tokens', exact: true }).click();
        await page.getByRole('heading', { name: 'SMS sync tokens', exact: true }).waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
        await page.getByRole('button', { name: 'Overview & Net Worth', exact: true }).click();
        await page.getByText('Real-Time Net Worth', { exact: true }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Dashboard must not overflow a phone viewport');
        await pool.query("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id=$1", [user.id]);
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await page.waitForURL(/\/login/);
        assert.ok(!(await context.cookies()).some((cookie) => cookie.name === 'tracksuite_session'));
        await page.getByLabel('Email address', { exact: true }).fill(credentials.email);
        await page.getByLabel('Password', { exact: true }).fill(credentials.password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.getByText('Real-Time Net Worth', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Log out', exact: true }).click();
        await page.waitForURL(/\/login/);
        assert.equal((await context.request.get('/api/auth/me')).status(), 401);
        assert.deepEqual(errors, [], 'Browser rendering must not raise uncaught errors');
      } catch (error) {
        t.diagnostic(`Browser location: ${page.url()}\nErrors: ${errors.join('\n')}\n${(await page.locator('body').innerText()).slice(-8000)}`);
        throw error;
      } finally { await context.close(); }
    } finally { await browser?.close(); await server.stop(); }
  });
});
