import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { addAccount, getAccountById, updateAccount } from '../src/lib/repo/accounts';
import { addAsset, updateAsset } from '../src/lib/repo/assets';
import { addLiability, updateLiability } from '../src/lib/repo/liabilities';
import { addTransaction, getTransactionPage, getTransactions, reverseTransaction, updateTransaction } from '../src/lib/repo/transactions';
import { addBudget, getBudgets, retireBudget, updateBudget } from '../src/lib/repo/budgets';
import { addSavingsGoal, contributeToGoal, editSavingsGoal, getGoalContributions } from '../src/lib/repo/savings-goals';
import { getCategories } from '../src/lib/repo/categories';
import { getRecordHistory } from '../src/lib/repo/history';
import { commitImportBatch, createImportPreview, reverseImportBatch } from '../src/lib/repo/imports';
import { todayLocal, type PersonalTransaction } from '../src/lib/repo/types';
import { createTestUser, withTestDatabase } from './test-db';

const wallet = (userId: number, name: string, balance = 1000) => addAccount(userId, {
  name, balance, institution: 'Test', account_type: 'cash', currency: 'KES', is_asset: true,
});
const movement = (account_id: string | number, overrides: Partial<PersonalTransaction> = {}) => ({
  account_id, amount: 100, currency: 'KES', type: 'expense' as const, date: todayLocal(),
  description: 'Workflow test', category: 'Other', reference: randomUUID(), import_source: 'manual' as const, ...overrides,
});

test('everyday workflows preserve balances, ownership and understandable history', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    await t.test('transaction corrections replace both transfer legs and linked fees, reject stale writes and reverse exactly', async () => {
      const user = await createTestUser(pool);
      const other = await createTestUser(pool);
      const a = await wallet(user, 'A');
      const b = await wallet(user, 'B');
      const c = await wallet(user, 'C');
      const foreign = await wallet(other, 'Not owned');
      const first = (await addTransaction(user, movement(a.id, {
        type: 'transfer', transfer_account_id: b.id, amount: 100, fee_amount: 2,
      }))).transaction;
      const corrected = await updateTransaction(user, first.id, {
        account_id: b.id, transfer_account_id: c.id, amount: 150, fee_amount: 3, fee_account_id: c.id,
      }, first.version, 'Correct transfer wallets and fee');
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getAccountById(user, b.id))?.balance, 850);
      assert.equal((await getAccountById(user, c.id))?.balance, 1147);
      const fee = (await getTransactions(user)).find((tx) => tx.parent_transaction_id === first.id)!;
      assert.equal(fee.account_id, c.id);
      assert.equal(fee.amount, 3);
      await assert.rejects(updateTransaction(user, fee.id, { amount: 9 }, fee.version, 'Wrong fee edit'), /parent transaction/);
      await assert.rejects(updateTransaction(user, first.id, { amount: 200 }, first.version, 'Stale edit'), /changed since/);
      await assert.rejects(updateTransaction(user, first.id, { transfer_account_id: foreign.id, fee_account_id: b.id }, corrected.version, 'Not owned'), /not owned/);
      await assert.rejects(updateTransaction(other, first.id, { amount: 1 }, corrected.version, 'Not owned'), /not found/);
      const noFee = await updateTransaction(user, first.id, { fee_amount: 0 }, corrected.version, 'Remove erroneous fee');
      assert.equal((await getAccountById(user, c.id))?.balance, 1150);
      const withFee = await updateTransaction(user, first.id, { fee_amount: 1.25, fee_account_id: b.id },
        noFee.version, 'Restore correct source fee');
      assert.equal((await getTransactions(user)).filter((tx) => tx.parent_transaction_id === first.id).length, 1);
      const history = await getRecordHistory(user, 'transaction', first.id);
      assert.equal(history.entries[0].reason, 'Restore correct source fee');
      assert.equal(history.entries[0].before?.fee_amount, 0);
      assert.equal(history.entries[0].after.fee_amount, 1.25);
      assert.deepEqual((await getRecordHistory(other, 'transaction', first.id)).entries, []);
      await reverseTransaction(user, first.id, withFee.version, 'Entered the transfer twice');
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getAccountById(user, b.id))?.balance, 1000);
      assert.equal((await getAccountById(user, c.id))?.balance, 1000);
      assert.equal((await getTransactions(user)).length, 0);
      assert.equal((await getTransactionPage(user, { status: 'reversed' })).transactions.length, 2);
      assert.equal((await getRecordHistory(user, 'transaction', first.id)).entries[0].action, 'reverse');
      assert.equal((await addTransaction(user, movement(a.id, { reference: first.reference }))).isDuplicate, false);
    });

    await t.test('failed corrections and duplicate references roll back balances, fees, versions and audit rows', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Rollback source');
      const b = await wallet(user, 'Rollback destination');
      const first = (await addTransaction(user, movement(a.id))).transaction;
      const second = (await addTransaction(user, movement(a.id))).transaction;
      await assert.rejects(updateTransaction(user, first.id, { reference: second.reference, amount: 50 },
        first.version, 'Duplicate reference'), /another active transaction/);
      const historyBefore = (await getRecordHistory(user, 'transaction', first.id)).entries;
      await pool.query(`CREATE FUNCTION fail_workflow_balance() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id=${Number(b.id)} THEN RAISE EXCEPTION 'Injected workflow failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_workflow_balance BEFORE UPDATE OF current_balance ON accounts
        FOR EACH ROW EXECUTE FUNCTION fail_workflow_balance();`);
      try {
        await assert.rejects(updateTransaction(user, first.id, {
          type: 'transfer', transfer_account_id: b.id, amount: 30, fee_amount: 2,
        }, first.version, 'Injected failed correction'), /Injected workflow failure/);
      } finally {
        await pool.query('DROP TRIGGER fail_workflow_balance ON accounts; DROP FUNCTION fail_workflow_balance();');
      }
      assert.equal((await getAccountById(user, a.id))?.balance, 800);
      assert.equal((await getAccountById(user, b.id))?.balance, 1000);
      assert.deepEqual((await getRecordHistory(user, 'transaction', first.id)).entries, historyBefore);
      assert.equal((await getTransactions(user)).find((tx) => tx.id === first.id)?.version, first.version);
      assert.equal((await getTransactions(user)).filter((tx) => tx.parent_transaction_id).length, 0);
    });

    await t.test('edited imports still undo their corrected effects and serialize against concurrent undo', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Import wallet');
      const b = await wallet(user, 'Correct wallet');
      const preview = await createImportPreview(user, {
        accountId: a.id, rawText: 'QHL921KK89 Confirmed. Ksh20.00 sent to JOHN DOE on 22/10/26 at 11:45 AM. Transaction cost, Ksh1.25.',
      });
      await commitImportBatch(user, preview.id, preview.rows.map((row) => ({ row: row.row, decision: 'import', reviewed: true })));
      const root = (await getTransactions(user)).find((tx) => !tx.parent_transaction_id)!;
      await updateTransaction(user, root.id, { account_id: b.id, amount: 30, fee_amount: 2.5, fee_account_id: b.id },
        root.version, 'Correct imported account and amount');
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getAccountById(user, b.id))?.balance, 967.5);
      const latest = (await getTransactions(user)).find((tx) => tx.id === root.id)!;
      const results = await Promise.allSettled([
        updateTransaction(user, root.id, { amount: 35 }, latest.version, 'Concurrent correction'),
        reverseImportBatch(user, preview.id),
      ]);
      assert.equal(results[1].status, 'fulfilled');
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getAccountById(user, b.id))?.balance, 1000);
      assert.equal((await getTransactions(user)).length, 0);
      await assert.rejects(updateTransaction(user, root.id, { amount: 1 }, latest.version, 'Reversed record'), /not found/);
    });

    await t.test('budget actuals cover the full selected month, exclude voids and transfer principal, and canonicalize categories', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Budget source', 10000);
      const b = await wallet(user, 'Budget destination', 0);
      const budget = await addBudget(user, { category: 'Airtime & Internet', monthly_limit: 1000, currency: 'KES' });
      const month = todayLocal().slice(0, 7);
      await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category)
        SELECT $1,$2,2.50,'expense',$3::date,'Bulk airtime','Airtime & Internet (Safaricom)' FROM generate_series(1,600)`,
      [user, a.id, `${month}-01`]);
      await addTransaction(user, movement(a.id, { type: 'transfer', transfer_account_id: b.id, category: budget.category, amount: 200 }));
      const voided = (await addTransaction(user, movement(a.id, { category: budget.category, amount: 9 }))).transaction;
      await reverseTransaction(user, voided.id, voided.version, 'Accidental entry');
      await addTransaction(user, movement(a.id, { category: budget.category, date: '2000-01-01', amount: 100 }));
      const actual = (await getBudgets(user, month))[0];
      assert.equal(actual.category, 'Airtime & Internet (Safaricom)');
      assert.equal(actual.actual_spending, 1500);
      assert.equal(actual.remaining, -500);
      assert.equal(actual.overspent, true);
      assert.equal((await getBudgets(user, '2000-01'))[0].actual_spending, 100);
      await assert.rejects(addBudget(user, { category: 'airtime & internet', monthly_limit: 20, currency: 'KES' }), /already exists/);
      const updated = await updateBudget(user, budget.id, { ...budget, monthly_limit: 2000 }, budget.version, 'Raise monthly allowance');
      assert.equal((await getBudgets(user, month))[0].remaining, 500);
      await assert.rejects(updateBudget(user, budget.id, budget, budget.version, 'Stale budget'), /changed since/);
      await retireBudget(user, budget.id, updated.version, 'No longer tracking this category');
      assert.equal((await getBudgets(user)).length, 0);
      assert.ok((await getRecordHistory(user, 'budget', budget.id)).entries.length >= 3);
      assert.equal((await getCategories(user)).filter((c) => c.name === 'Airtime & Internet (Safaricom)').length, 1);
      assert.ok(!(await getCategories(user)).some((c) => c.name === 'Airtime & Internet'));
      await assert.rejects(getBudgets(user, '2026-13'), /calendar date/);
    });

    await t.test('server pagination and filters reach old entries, both transfer wallets and empty pages without leaking users', async () => {
      const user = await createTestUser(pool);
      const other = await createTestUser(pool);
      const a = await wallet(user, 'Pagination');
      const b = await wallet(user, 'Destination');
      await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category)
        SELECT $1,$2,1,'expense','2026-11-01','Recent row','Food & Groceries' FROM generate_series(1,225)`, [user, a.id]);
      const old = (await addTransaction(user, movement(a.id, { date: '2020-01-02', description: 'Literal 10% bill', category: 'Shopping' }))).transaction;
      await addTransaction(other, movement((await wallet(other, 'Private')).id, { description: 'Literal 10% bill' }));
      const first = await getTransactionPage(user, { limit: 50 });
      const last = await getTransactionPage(user, { limit: 50, offset: 200 });
      assert.equal(first.total, 226);
      assert.equal(first.hasMore, true);
      assert.equal(last.transactions.at(-1)?.id, old.id);
      assert.equal(last.hasMore, false);
      assert.equal(new Set([...first.transactions, ...last.transactions].map((tx) => tx.id)).size, 76);
      const filtered = await getTransactionPage(user, {
        search: '10%', category: 'Shopping', startDate: '2020-01-01', endDate: '2020-01-31', transactionType: 'expense',
      });
      assert.deepEqual(filtered.transactions.map((tx) => tx.id), [old.id]);
      assert.equal((await getTransactionPage(user, { offset: 9999 })).total, 226);
      const transfer = (await addTransaction(user, movement(a.id, { type: 'transfer', transfer_account_id: b.id }))).transaction;
      assert.deepEqual((await getTransactionPage(user, { accountId: b.id, needsReview: true })).transactions.map((tx) => tx.id), [transfer.id]);
      for (const filters of [{ limit: NaN }, { offset: -1 }, { startDate: '2026-02-30' }, { startDate: '2026-03-01', endDate: '2026-02-01' }]) {
        await assert.rejects(getTransactionPage(user, filters));
      }
    });

    await t.test('custom goal earmarks and releases are idempotent, audited, nonnegative and never move account balances', async () => {
      const user = await createTestUser(pool);
      const other = await createTestUser(pool);
      const a = await wallet(user, 'Savings');
      const goal = await addSavingsGoal(user, { name: 'Emergency fund', target_amount: 1000, current_amount: 100, currency: 'KES' });
      const input = { amount: 123.45, date: todayLocal(), note: 'Custom earmark', request_id: randomUUID(), version: goal.version };
      const [first, retry] = await Promise.all([contributeToGoal(user, goal.id, input), contributeToGoal(user, goal.id, input)]);
      assert.equal([first, retry].filter((r) => !r.isDuplicate).length, 1);
      assert.equal(first.goal.current_amount, 223.45);
      await assert.rejects(contributeToGoal(user, goal.id, { ...input, amount: 200 }), /different details/);
      await assert.rejects(contributeToGoal(user, goal.id, { ...input, request_id: randomUUID() }), /changed since/);
      const released = await contributeToGoal(user, goal.id, {
        amount: -23.45, date: todayLocal(), request_id: randomUUID(), version: first.goal.version,
      });
      assert.equal(released.goal.current_amount, 200);
      await assert.rejects(contributeToGoal(user, goal.id, {
        amount: -201, date: todayLocal(), request_id: randomUUID(), version: released.goal.version,
      }), /Saved amount/);
      await assert.rejects(contributeToGoal(other, goal.id, input), /not found/);
      await assert.rejects(getGoalContributions(other, goal.id), /not found/);
      const edited = await editSavingsGoal(user, goal.id, { ...goal, name: 'Updated target', target_amount: 1200, target_date: '2027-01-01' },
        released.goal.version, 'Extend goal target');
      assert.equal(edited.current_amount, 200);
      const history = await getGoalContributions(user, goal.id);
      assert.equal(history.contributions.length, 3);
      assert.equal(history.contributions.reduce((sum, row) => sum + row.amount, 0), 200);
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getTransactions(user)).length, 0);
    });

    await t.test('account, asset and debt maintenance has versioned history and cannot rewrite ledger balances', async () => {
      const user = await createTestUser(pool);
      const other = await createTestUser(pool);
      const a = await wallet(user, 'Original name');
      const edited = await updateAccount(user, a.id, { ...a, name: 'Renamed wallet' }, a.version, 'Clarify wallet name');
      assert.equal(edited.balance, 1000);
      assert.equal(edited.opening_balance, 1000);
      await assert.rejects(updateAccount(user, a.id, a, a.version, 'Stale account'), /changed since/);
      await assert.rejects(updateAccount(other, a.id, a, edited.version, 'Foreign account'), /not found/);
      const asset = await addAsset(user, { name: 'Bike', category: 'vehicle', estimated_value: 250, currency: 'KES' });
      const valued = await updateAsset(user, asset.id, { ...asset, estimated_value: 200 }, asset.version, 'Updated valuation');
      assert.equal(valued.estimated_value, 200);
      await assert.rejects(updateAsset(other, asset.id, asset, valued.version, 'Not owned'), /not found/);
      const debt = await addLiability(user, {
        name: 'Loan', creditor: 'Test', category: 'personal_loan', principal_amount: 300, outstanding_balance: 200, currency: 'KES',
      });
      const repaid = await updateLiability(user, debt.id, { ...debt, outstanding_balance: 0, interest_rate: 0 },
        debt.version, 'Closing loan statement; payment recorded separately');
      assert.equal(repaid.outstanding_balance, 0);
      await assert.rejects(updateLiability(user, debt.id, { ...debt, outstanding_balance: -1 }, repaid.version, 'Invalid'), /Outstanding/);
      await assert.rejects(updateAsset(user, asset.id, valued, valued.version, ''), /Change reason/);
      assert.equal((await getRecordHistory(user, 'asset', asset.id)).entries[0].before?.estimated_value, 250);
      assert.equal((await getRecordHistory(user, 'liability', debt.id)).entries[0].after.outstanding_balance, 0);
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
    });
  });
});
