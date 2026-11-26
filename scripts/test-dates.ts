import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { addAccount, getAccountById } from '../src/lib/repo/accounts';
import { addTransaction, getTransactions } from '../src/lib/repo/transactions';
import { addSavingsGoal, getSavingsGoals } from '../src/lib/repo/savings-goals';
import { addLiability, getLiabilities } from '../src/lib/repo/liabilities';
import { toDateString, todayLocal } from '../src/lib/repo/types';
import { createTestUser, withTestDatabase } from './test-db';

process.env.TZ = 'Africa/Nairobi';

test('Nairobi calendar dates stay local across month and year boundaries', () => {
  const monthStart = new Date('2026-11-01T00:30:00+03:00');
  const yearStart = new Date('2027-01-01T00:30:00+03:00');
  assert.equal(monthStart.toISOString().slice(0, 10), '2026-10-31');
  assert.equal(toDateString(monthStart), '2026-11-01');
  assert.equal(todayLocal(yearStart), '2027-01-01');
  assert.equal(toDateString(new Date(2024, 1, 29)), '2024-02-29');
});

test('SQL DATE round trips preserve transaction, goal and loan dates', async () => {
  await withTestDatabase(async ({ pool }) => {
    const userId = await createTestUser(pool);
    const wallet = await addAccount(userId, {
      name: 'Date Test Wallet', institution: 'Test', account_type: 'cash',
      currency: 'KES', balance: 100, is_asset: true,
    });
    const dates = ['2026-10-31', '2026-11-01', '2026-01-01', '2026-12-31', '2024-02-29'];
    for (const date of dates) {
      const reference = randomUUID();
      await addTransaction(userId, {
        account_id: wallet.id, amount: 1, currency: 'KES', type: 'expense',
        date, description: 'Date round trip', category: 'Other',
        reference, import_source: 'manual',
      });
      const saved = await getTransactions(userId, { search: reference });
      assert.equal(saved[0]?.date, date);
    }
    assert.equal((await getAccountById(userId, wallet.id))?.balance, 95);

    const goal = await addSavingsGoal(userId, {
      name: 'Year-end Goal', target_amount: 100, current_amount: 0,
      currency: 'KES', target_date: '2026-12-31',
    });
    const liability = await addLiability(userId, {
      name: 'Month-start Loan', creditor: 'Test', category: 'personal_loan',
      principal_amount: 100, outstanding_balance: 50,
      currency: 'KES', due_date: '2026-11-01',
    });
    assert.equal((await getSavingsGoals(userId)).find((g) => g.id === goal.id)?.target_date, '2026-12-31');
    assert.equal((await getLiabilities(userId)).find((l) => l.id === liability.id)?.due_date, '2026-11-01');
  });
});
