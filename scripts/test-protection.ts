import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { addAccount, getAccountById } from '../src/lib/repo/accounts';
import { addAsset } from '../src/lib/repo/assets';
import { addLiability } from '../src/lib/repo/liabilities';
import { addSavingsGoal } from '../src/lib/repo/savings-goals';
import { addTransaction, reconcileAccount, reverseTransaction } from '../src/lib/repo/transactions';
import { exportFinancialData } from '../src/lib/repo/export';
import { ingestSms } from '../src/lib/repo/ingestion';
import { createIngestToken, createSession, createUser, isRateLimited, recoverAccount, validateIngestToken, validateSession, verifyLogin } from '../src/lib/repo/auth';
import { todayLocal } from '../src/lib/repo/types';
import { createTestUser, withTestDatabase } from './test-db';

test('data protection and uncertain-save recovery', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    await t.test('concurrent creation retries are recorded once, with conflicting reuses rejected', async () => {
      const user = await createTestUser(pool);
      const request_id = randomUUID();
      const creators = [
        { table: 'accounts', create: (name: string) => addAccount(user, { name, request_id, institution: '', account_type: 'cash', currency: 'KES', balance: 100, is_asset: true }) },
        { table: 'assets', create: (name: string) => addAsset(user, { name, request_id, category: 'other', currency: 'KES', estimated_value: 10 }) },
        { table: 'liabilities', create: (name: string) => addLiability(user, { name, request_id, creditor: '', category: 'other', currency: 'KES', principal_amount: 10, outstanding_balance: 5 }) },
        { table: 'savings_goals', create: (name: string) => addSavingsGoal(user, { name, request_id, currency: 'KES', target_amount: 100, current_amount: 10 }) },
      ];
      for (const { table, create } of creators) {
        const records = await Promise.all([create('Retry fixture'), create('Retry fixture'), create('Retry fixture')]);
        assert.ok(records.every((record) => record.id === records[0].id));
        await assert.rejects(create('Changed uncertain save'), /different details/);
        assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE user_id=$1`, [user])).rows[0].count, 1);
      }
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM record_history WHERE user_id=$1', [user])).rows[0].count, 4);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM goal_contributions WHERE user_id=$1', [user])).rows[0].count, 1);
      const other = await createTestUser(pool);
      await addAccount(other, { name: 'Other user', request_id, institution: '', account_type: 'cash', currency: 'KES', balance: 1, is_asset: true });
    });

    await t.test('concurrent first SMS deliveries create one wallet and one receipt', async () => {
      const user = await createTestUser(pool);
      const date = todayLocal();
      const smsDate = `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
      const message = `NEW0000001 Confirmed. You have received Ksh10.00 from SAMPLE PERSON on ${smsDate} at 10:00 AM.`;
      const results = await Promise.all([ingestSms(user, { message }), ingestSms(user, { message })]);
      assert.equal(results.filter((result) => result && !result.needsReview && result.duplicate).length, 1);
      const accounts = (await pool.query('SELECT current_balance FROM accounts WHERE user_id=$1', [user])).rows;
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].current_balance, '10.00');
    });

    await t.test('exports include the entire owned ledger and history but never authentication records', async () => {
      const user = await createUser({ email: `${randomUUID()}@example.invalid`, password: randomUUID(), full_name: 'Export fixture' });
      const account = await addAccount(user.id, { name: 'Export wallet', institution: '', account_type: 'cash', currency: 'KES', balance: 100, is_asset: true });
      await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category)
        SELECT $1,$2,0.01,'expense',$3::date,'Export entry ' || g,'Other' FROM generate_series(1,600) g`, [user.id, account.id, todayLocal()]);
      await pool.query('UPDATE accounts SET current_balance=current_balance-6 WHERE id=$1', [account.id]);
      const first = (await pool.query('SELECT id,version FROM transactions WHERE user_id=$1 ORDER BY id LIMIT 1', [user.id])).rows[0];
      await reverseTransaction(user.id, first.id, first.version, 'Retained reversal in export');
      const session = await createSession(user.id);
      const token = await createIngestToken(user.id, 'Export exclusion fixture');
      const secret = (await pool.query('SELECT password_hash FROM users WHERE id=$1', [user.id])).rows[0].password_hash;
      const data = await exportFinancialData(user.id);
      assert.equal(data.records.accounts.length, 1);
      assert.equal(data.records.transactions.length, 600);
      assert.ok(data.records.record_history.length > 600);
      assert.equal(data.records.transactions.filter((row) => (row as { voided_at: unknown }).voided_at).length, 1);
      for (const records of Object.values(data.records)) {
        assert.ok(records.every((row) => (row as { user_id: number }).user_id === user.id));
      }
      const json = JSON.stringify(data);
      for (const value of [session, token.token, secret]) assert.ok(!json.includes(value));
      for (const table of ['users', 'sessions', 'ingest_tokens', 'login_attempts']) assert.ok(!(table in data.records));
    });

    await t.test('owner recovery revokes only the intended account credentials without altering financial history', async () => {
      const password = randomUUID();
      const user = await createUser({ email: `${randomUUID()}@example.invalid`, password, full_name: 'Recovery fixture' });
      const other = await createTestUser(pool);
      await addAccount(user.id, { name: 'Preserved wallet', institution: '', account_type: 'cash', currency: 'KES', balance: 123.45, is_asset: true });
      const ownSession = await createSession(user.id);
      const otherSession = await createSession(other);
      const ownToken = await createIngestToken(user.id, 'Recovery fixture');
      const otherToken = await createIngestToken(other, 'Other fixture');
      await pool.query("INSERT INTO login_attempts (identifier,succeeded) SELECT $1,FALSE FROM generate_series(1,10)", [user.email]);
      assert.equal(await isRateLimited(user.email), true);
      const before = (await exportFinancialData(user.id)).records;
      const replacement = randomUUID();
      await recoverAccount(user.email, replacement);
      assert.equal(await verifyLogin(user.email, password), null);
      assert.equal((await verifyLogin(user.email, replacement))?.id, user.id);
      assert.equal(await validateSession(ownSession), null);
      assert.equal(await validateIngestToken(ownToken.token), null);
      assert.equal((await validateSession(otherSession))?.id, other);
      assert.equal(await validateIngestToken(otherToken.token), other);
      assert.equal(await isRateLimited(user.email), false);
      assert.deepEqual((await exportFinancialData(user.id)).records, before);
    });

    await t.test('an uncertain reconciliation retry cannot overwrite subsequent wallet movements', async () => {
      const user = await createTestUser(pool);
      const account = await addAccount(user, { name: 'Reconciliation retry', institution: '', account_type: 'cash', currency: 'KES', balance: 100, is_asset: true });
      await reconcileAccount(user, account.id, 95, todayLocal(), 'Cash count', account.version);
      assert.equal(await reconcileAccount(user, account.id, 95, todayLocal(), 'Cash count', account.version), null);
      await addTransaction(user, { account_id: account.id, type: 'income', amount: 1, currency: 'KES', date: todayLocal(), category: 'Other', description: 'Later receipt', import_source: 'manual' });
      await assert.rejects(reconcileAccount(user, account.id, 95, todayLocal(), 'Cash count', account.version), /changed since/);
      assert.equal((await getAccountById(user, account.id))?.balance, 96);
      assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM transactions WHERE user_id=$1 AND type='adjustment'", [user])).rows[0].count, 1);
    });
  });
});
