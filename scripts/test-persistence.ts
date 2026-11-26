import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { addAccount, getAccountById, getAccounts } from '../src/lib/repo/accounts';
import {
  addTransaction,
  getTransactions,
  updateTransactionCategory,
} from '../src/lib/repo/transactions';
import { addAsset, getAssets } from '../src/lib/repo/assets';
import { addLiability, getLiabilities } from '../src/lib/repo/liabilities';
import { addBudget, getBudgets } from '../src/lib/repo/budgets';
import {
  addSavingsGoal,
  getSavingsGoals,
  updateSavingsGoal,
} from '../src/lib/repo/savings-goals';
import { getExpensesByCategory, getNetWorthMetrics } from '../src/lib/repo/networth';
import { PersonalTransaction, todayLocal } from '../src/lib/repo/types';
import { createTestUser, withTestDatabase } from './test-db';

process.env.TZ = 'Africa/Nairobi';

function account(userId: number, balance = 1000) {
  return addAccount(userId, {
    name: 'Test Wallet',
    institution: 'Test',
    account_type: 'mobile_money',
    currency: 'KES',
    balance,
    is_asset: true,
  });
}

function transaction(
  accountId: string | number,
  overrides: Partial<Omit<PersonalTransaction, 'id'>> = {},
): Omit<PersonalTransaction, 'id'> {
  return {
    account_id: accountId,
    amount: 500.25,
    currency: 'KES',
    type: 'income',
    date: todayLocal(),
    description: 'Test transaction',
    category: 'Salary & Primary Income',
    reference: randomUUID(),
    import_source: 'manual',
    ...overrides,
  };
}

test('financial persistence', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    await t.test('income and expenses persist with exact balance updates', async () => {
      const userId = await createTestUser(pool);
      const wallet = await account(userId);
      const income = await addTransaction(userId, transaction(wallet.id));
      const expense = await addTransaction(userId, transaction(wallet.id, {
        type: 'expense',
        amount: 125.10,
        category: 'Food & Groceries',
      }));

      assert.equal(income.isDuplicate, false);
      assert.equal(expense.isDuplicate, false);
      assert.equal((await getAccountById(userId, wallet.id))?.balance, 1375.15);
      const saved = await getTransactions(userId);
      assert.equal(saved.length, 2);
      assert.equal(saved.find((tx) => tx.id === income.transaction.id)?.amount, 500.25);
      assert.equal(saved.find((tx) => tx.id === expense.transaction.id)?.amount, 125.10);
    });

    await t.test('concurrent receipt retries insert once and change the balance once', async () => {
      const userId = await createTestUser(pool);
      const wallet = await account(userId);
      const input = transaction(wallet.id, { import_source: 'mpesa_sms' });
      const results = await Promise.all([
        addTransaction(userId, input),
        addTransaction(userId, input),
        addTransaction(userId, input),
      ]);

      assert.equal(results.filter((result) => !result.isDuplicate).length, 1);
      assert.equal(new Set(results.map((result) => result.transaction.id)).size, 1);
      assert.equal((await getTransactions(userId)).length, 1);
      assert.equal((await getAccountById(userId, wallet.id))?.balance, 1500.25);
    });

    await t.test('failed inserts leave no transaction, balance change or reserved receipt', async () => {
      const userId = await createTestUser(pool);
      const wallet = await account(userId);
      const input = transaction(wallet.id);

      await assert.rejects(
        addTransaction(userId, { ...input, description: 'x'.repeat(501) }),
        /Description.*500 characters/,
      );
      await pool.query(`
        CREATE FUNCTION fail_test_transaction_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Intentional insert failure'; END $$;
        CREATE TRIGGER fail_test_transaction_insert BEFORE INSERT ON transactions
          FOR EACH ROW EXECUTE FUNCTION fail_test_transaction_insert();
      `);
      try {
        await assert.rejects(addTransaction(userId, input), { code: 'P0001' });
      } finally {
        await pool.query('DROP TRIGGER fail_test_transaction_insert ON transactions; DROP FUNCTION fail_test_transaction_insert();');
      }
      assert.equal((await getTransactions(userId)).length, 0);
      assert.equal((await getAccountById(userId, wallet.id))?.balance, 1000);
      assert.equal((await addTransaction(userId, input)).isDuplicate, false);
      assert.equal((await getAccountById(userId, wallet.id))?.balance, 1500.25);
    });

    await t.test('a failed balance update rolls back the already-inserted transaction', async () => {
      const userId = await createTestUser(pool);
      const wallet = await account(userId);
      const input = transaction(wallet.id);
      await pool.query(`
        CREATE FUNCTION fail_test_balance_update() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'Intentional balance update failure';
        END;
        $$;
        CREATE TRIGGER fail_test_balance_update
        BEFORE UPDATE OF current_balance ON accounts
        FOR EACH ROW EXECUTE FUNCTION fail_test_balance_update();
      `);
      try {
        await assert.rejects(addTransaction(userId, input), { code: 'P0001' });
        assert.equal((await getTransactions(userId)).length, 0);
        assert.equal((await getAccountById(userId, wallet.id))?.balance, 1000);
      } finally {
        await pool.query(`
          DROP TRIGGER fail_test_balance_update ON accounts;
          DROP FUNCTION fail_test_balance_update();
        `);
      }
      assert.equal((await addTransaction(userId, input)).isDuplicate, false);
      assert.equal((await getAccountById(userId, wallet.id))?.balance, 1500.25);
    });

    await t.test('users cannot read or alter each other\'s transactions and accounts', async () => {
      const ownerId = await createTestUser(pool);
      const otherId = await createTestUser(pool);
      const ownerWallet = await account(ownerId);
      const otherWallet = await account(otherId, 700);
      const reference = randomUUID();
      const ownerTx = await addTransaction(ownerId, transaction(ownerWallet.id, {
        type: 'expense', amount: 25, category: 'Food & Groceries', reference,
      }));
      const otherTx = await addTransaction(otherId, transaction(otherWallet.id, {
        amount: 40, reference,
      }));

      assert.equal(otherTx.isDuplicate, false);
      assert.notEqual(ownerTx.transaction.id, otherTx.transaction.id);
      assert.deepEqual((await getAccounts(ownerId)).map((a) => a.id), [ownerWallet.id]);
      assert.equal(await getAccountById(ownerId, otherWallet.id), null);
      assert.deepEqual(
        (await getTransactions(ownerId)).map((tx) => tx.id),
        [ownerTx.transaction.id],
      );
      assert.deepEqual(await getTransactions(ownerId, { accountId: otherWallet.id }), []);
      assert.equal(
        await updateTransactionCategory(ownerId, otherTx.transaction.id, 'Other'),
        null,
      );
      await assert.rejects(
        addTransaction(ownerId, transaction(otherWallet.id)),
        /not found for user/,
      );
      assert.equal((await getAccountById(otherId, otherWallet.id))?.balance, 740);
      assert.equal((await getNetWorthMetrics(ownerId)).netWorth, 975);
      assert.equal((await getExpensesByCategory(ownerId))[0]?.total_amount, 25);
    });

    await t.test('transfer categorization does not turn own-money movement into cash flow', async () => {
      const userId = await createTestUser(pool);
      const wallet = await account(userId);
      const destination = await account(userId, 0);
      await addTransaction(userId, transaction(wallet.id, { amount: 100 }));
      await addTransaction(userId, transaction(wallet.id, {
        type: 'expense', amount: 40, category: 'Food & Groceries',
      }));
      const transfer = await addTransaction(userId, transaction(wallet.id, {
        type: 'transfer', amount: 250, category: 'Other', transfer_account_id: destination.id,
      }));
      const reviewed = await updateTransactionCategory(
        userId, transfer.transaction.id, 'Savings & MMF Deposit',
      );
      assert.equal(reviewed?.type, 'transfer');
      assert.equal(reviewed?.category, 'Savings & MMF Deposit');
      const metrics = await getNetWorthMetrics(userId);
      assert.equal(metrics.monthlyIncome, 100);
      assert.equal(metrics.monthlyExpenses, 40);
      assert.equal(metrics.netSavings, 60);
      assert.equal(metrics.savingsRate, 60);
      const spending = await getExpensesByCategory(userId);
      assert.equal(spending.length, 1);
      assert.equal(spending[0].category, 'Food & Groceries');
      assert.equal(spending[0].total_amount, 40);
    });

    await t.test('assets, debts, budgets and goals persist with verified net-worth totals', async () => {
      const userId = await createTestUser(pool);
      const otherId = await createTestUser(pool);
      await account(userId);
      const asset = await addAsset(userId, {
        name: 'Test Asset', category: 'other', estimated_value: 1200, currency: 'KES',
      });
      const liability = await addLiability(userId, {
        name: 'Test Loan', creditor: 'Test', category: 'personal_loan',
        principal_amount: 300, outstanding_balance: 240, currency: 'KES',
      });
      const budget = await addBudget(userId, {
        category: 'Food & Groceries', monthly_limit: 25, currency: 'KES',
      });
      const goal = await addSavingsGoal(userId, {
        name: 'Test Goal', target_amount: 500, current_amount: 150, currency: 'KES',
      });
      assert.equal(await updateSavingsGoal(otherId, goal.id, 20), null);
      assert.equal((await updateSavingsGoal(userId, goal.id, 20))?.current_amount, 170);
      assert.equal((await getAssets(userId))[0]?.id, asset.id);
      assert.equal((await getLiabilities(userId))[0]?.id, liability.id);
      assert.equal((await getBudgets(userId))[0]?.id, budget.id);
      assert.equal((await getSavingsGoals(userId))[0]?.current_amount, 170);
      assert.deepEqual(await getAssets(otherId), []);
      assert.deepEqual(await getLiabilities(otherId), []);
      assert.deepEqual(await getBudgets(otherId), []);
      assert.deepEqual(await getSavingsGoals(otherId), []);
      const metrics = await getNetWorthMetrics(userId);
      assert.equal(metrics.liquidCash, 1000);
      assert.equal(metrics.physicalAssets, 1200);
      assert.equal(metrics.totalAssets, 2200);
      assert.equal(metrics.totalLiabilities, 240);
      assert.equal(metrics.netWorth, 1960);
    });
  });
});
