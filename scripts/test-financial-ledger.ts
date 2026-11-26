import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';
import { runner } from 'node-pg-migrate';
import { addAccount, getAccountById } from '../src/lib/repo/accounts';
import { addTransaction, getTransactions, reconcileAccount } from '../src/lib/repo/transactions';
import { getExpensesByCategory, getNetWorthMetrics } from '../src/lib/repo/networth';
import { importTransaction } from '../src/lib/import-ledger';
import { parseSms } from '../src/lib/sms';
import { mpesaDateToIso } from '../src/lib/mpesa';
import { parseImportSource } from '../src/lib/import-parser';
import { parseBankSms } from '../src/lib/bank-sms';
import { todayLocal, type PersonalAccount, type PersonalTransaction } from '../src/lib/repo/types';
import { createTestUser, withTestDatabase } from './test-db';

const wallet = (userId: number, name: string, balance = 1000, account_type: PersonalAccount['account_type'] = 'cash') =>
  addAccount(userId, { name, institution: 'Test', balance, account_type, currency: 'KES', is_asset: true });

const movement = (account_id: string | number, overrides: Partial<Omit<PersonalTransaction, 'id'>> = {}) => ({
  account_id, amount: 100, currency: 'KES', type: 'expense' as const, date: todayLocal(),
  description: 'Ledger test', category: 'Other', reference: randomUUID(), import_source: 'manual' as const,
  ...overrides,
});

test('financial ledger correctness', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    await t.test('upgrade preserves legacy balances and derives opening balances without inventing transfer legs', async () => {
      const later = await pool.query(`SELECT COUNT(*)::int AS count FROM pgmigrations
        WHERE name > '1700000000002_ingest_token_selector'`);
      const migrate = (direction: 'up' | 'down') => runner({
        databaseUrl: process.env.DATABASE_URL!, dir: path.resolve('migrations'),
        migrationsTable: 'pgmigrations', ignorePattern: '^schema\\.sql$', direction,
        ...(direction === 'down' ? { count: later.rows[0].count } : {}), log: () => {},
      });
      await migrate('down');
      const user = await createTestUser(pool);
      const id = (await pool.query(`INSERT INTO accounts
        (user_id,name,account_type,current_balance) VALUES ($1,'Legacy','cash',1375.15) RETURNING id`, [user])).rows[0].id;
      await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category)
        VALUES ($1,$2,500.25,'income','2024-01-01','Legacy income','Other'),
        ($1,$2,125.10,'expense','2024-01-01','Legacy expense','Other'),
        ($1,$2,200,'transfer','2024-01-01','Unpaired legacy transfer','Other')`, [user, id]);
      await pool.query(`INSERT INTO assets (user_id,name,category,estimated_value,currency)
        VALUES ($1,'Legacy foreign asset','other',350,'USD')`, [user]);
      const legacyGoal = (await pool.query(`INSERT INTO savings_goals
        (user_id,name,target_amount,current_amount) VALUES ($1,'Legacy earmark',500,75.25) RETURNING id`, [user])).rows[0].id;
      await pool.query(`INSERT INTO budgets (user_id,category,monthly_limit)
        VALUES ($1,'Utilities (KPLC/Water)',100)`, [user]);
      await migrate('up');
      const saved = await getAccountById(user, id);
      assert.equal(saved?.balance, 1375.15);
      assert.equal(saved?.opening_balance, 1000);
      assert.equal((await getTransactions(user)).find((tx) => tx.type === 'transfer')?.transfer_account_id, undefined);
      const foreign = (await pool.query('SELECT currency,estimated_value FROM assets WHERE user_id=$1', [user])).rows[0];
      assert.equal(foreign.currency, 'USD');
      assert.equal(foreign.estimated_value, '350.00');
      const openingEarmark = (await pool.query('SELECT amount,note FROM goal_contributions WHERE goal_id=$1', [legacyGoal])).rows[0];
      assert.equal(openingEarmark.amount, '75.25');
      assert.match(openingEarmark.note, /Opening earmark/);
      assert.equal((await pool.query('SELECT current_amount FROM savings_goals WHERE id=$1', [legacyGoal])).rows[0].current_amount, '75.25');
      assert.equal((await pool.query('SELECT category FROM budgets WHERE user_id=$1', [user])).rows[0].category, 'Utilities & Water (KPLC)');
      await assert.rejects(getNetWorthMetrics(user), /Only KES/);
    });

    await t.test('opposite transfers, fees and concurrent retries settle each wallet exactly once', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'A');
      const b = await wallet(user, 'B');
      const first = movement(a.id, { type: 'transfer', transfer_account_id: b.id, amount: 80, fee_amount: 1.25 });
      const second = movement(b.id, { type: 'transfer', transfer_account_id: a.id, amount: 50, fee_amount: 2.10 });
      const results = await Promise.all([addTransaction(user, first), addTransaction(user, second), addTransaction(user, first)]);
      assert.equal(results.filter((r) => !r.isDuplicate).length, 2);
      assert.equal((await getAccountById(user, a.id))?.balance, 968.75);
      assert.equal((await getAccountById(user, b.id))?.balance, 1027.90);
      const transactions = await getTransactions(user);
      assert.equal(transactions.length, 4);
      assert.equal(transactions.filter((tx) => tx.parent_transaction_id).length, 2);
      assert.equal((await getTransactions(user, { accountId: b.id })).filter((tx) => tx.type === 'transfer').length, 2);
      const metrics = await getNetWorthMetrics(user);
      assert.equal(metrics.netWorth, 1996.65);
      assert.equal(metrics.monthlyIncome, 0);
      assert.equal(metrics.monthlyExpenses, 3.35);
      await assert.rejects(addTransaction(user, { ...first, amount: 81 }), /different transaction/);
      assert.equal((await getAccountById(user, a.id))?.balance, 968.75);
    });

    await t.test('a destination update failure rolls back both legs and the fee', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Source');
      const b = await wallet(user, 'Destination');
      const input = movement(a.id, { type: 'transfer', transfer_account_id: b.id, fee_amount: 5 });
      await pool.query(`CREATE FUNCTION fail_destination() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id = ${Number(b.id)} THEN RAISE EXCEPTION 'Injected failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_destination BEFORE UPDATE OF current_balance ON accounts
        FOR EACH ROW EXECUTE FUNCTION fail_destination();`);
      try {
        await assert.rejects(addTransaction(user, input), { code: 'P0001' });
        assert.equal((await getTransactions(user)).length, 0);
        assert.equal((await getAccountById(user, a.id))?.balance, 1000);
        assert.equal((await getAccountById(user, b.id))?.balance, 1000);
      } finally {
        await pool.query('DROP TRIGGER fail_destination ON accounts; DROP FUNCTION fail_destination();');
      }
      assert.equal((await addTransaction(user, input)).isDuplicate, false);
    });

    await t.test('reconciliation is signed, audited, serialized and outside income and spending', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Reconciliation');
      const date = todayLocal();
      const down = await reconcileAccount(user, a.id, '900.10', date, 'Closing statement');
      assert.equal(down?.amount, -99.90);
      assert.equal(down?.type, 'adjustment');
      assert.equal(down?.description, 'Closing statement');
      const results = await Promise.all([
        reconcileAccount(user, a.id, 950.35, date, 'Cash count'),
        reconcileAccount(user, a.id, 950.35, date, 'Cash count'),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(results.find(Boolean)?.amount, 50.25);
      const saved = await getAccountById(user, a.id);
      assert.equal(saved?.balance, 950.35);
      assert.equal(saved?.opening_balance, 1000);
      const metrics = await getNetWorthMetrics(user);
      assert.equal(metrics.monthlyIncome, 0);
      assert.equal(metrics.monthlyExpenses, 0);
      assert.equal((await getExpensesByCategory(user)).length, 0);
      assert.equal(await reconcileAccount(user, a.id, 950.35, date, 'Already matches'), null);
      await assert.rejects(reconcileAccount(user, a.id, 1, '2000-01-01', 'Old statement'), /latest recorded/);
    });

    await t.test('monthly reports include over 500 entries, exclude other months and other users', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'Reporting', 10000);
      const date = todayLocal();
      await pool.query(`INSERT INTO transactions (user_id,account_id,amount,type,date,description,category)
        SELECT $1,$2,2.55,'expense',$3::date,'Bulk expense','Food & Groceries' FROM generate_series(1,600)`, [user, a.id, date]);
      await pool.query('UPDATE accounts SET current_balance=current_balance-1530 WHERE id=$1', [a.id]);
      await addTransaction(user, movement(a.id, { type: 'income', amount: 100 }));
      const previous = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      previous.setUTCDate(0);
      await addTransaction(user, movement(a.id, { amount: 400, date: previous.toISOString().slice(0, 10) }));
      const other = await createTestUser(pool);
      await addTransaction(other, movement((await wallet(other, 'Other')).id, { amount: 777 }));
      const metrics = await getNetWorthMetrics(user);
      assert.equal(metrics.monthlyIncome, 100);
      assert.equal(metrics.monthlyExpenses, 1530);
      assert.equal(metrics.netWorth, 8170);
      const spending = await getExpensesByCategory(user);
      assert.equal(spending.length, 1);
      assert.equal(spending[0].total_amount, 1530);
      assert.equal(spending[0].transaction_count, 600);
    });

    await t.test('invalid money, dates, currency and unauthorized counterparties cannot change balances', async () => {
      const user = await createTestUser(pool);
      const other = await createTestUser(pool);
      const a = await wallet(user, 'Owned');
      const foreign = await wallet(other, 'Not owned');
      for (const amount of [0, -1, NaN, Infinity, 1.001]) {
        await assert.rejects(addTransaction(user, movement(a.id, { amount })));
      }
      for (const overrides of [
        { currency: 'USD' }, { date: '2026-02-30' }, { type: 'adjustment' as const },
        { fee_amount: -1 }, { type: 'transfer' as const },
        { type: 'transfer' as const, transfer_account_id: a.id },
        { type: 'transfer' as const, transfer_account_id: foreign.id },
        { fee_amount: 2, fee_account_id: foreign.id },
      ]) await assert.rejects(addTransaction(user, movement(a.id, overrides)));
      await assert.rejects(reconcileAccount(user, foreign.id, 1, todayLocal(), 'Unauthorized'));
      await assert.rejects(addAccount(user, { name: 'FX', institution: 'Test', account_type: 'cash', currency: 'USD', balance: 0, is_asset: true }), /Only KES/);
      assert.equal((await getTransactions(user)).length, 0);
      assert.equal((await getAccountById(user, a.id))?.balance, 1000);
      assert.equal((await getAccountById(other, foreign.id))?.balance, 1000);
    });

    await t.test('cash withdrawal/deposit principal moves between wallets while fees reduce net worth', async () => {
      const user = await createTestUser(pool);
      const mobile = await wallet(user, 'M-PESA', 1000, 'mobile_money');
      const cash = await wallet(user, 'Cash', 100);
      const savings = await wallet(user, 'M-Shwari', 0, 'investment');
      const accounts = [mobile, cash, savings];
      for (const [kind, type, amount, cost] of [
        ['withdraw', 'expense', 300, 29], ['deposit', 'income', 100, 5],
      ] as const) {
        const row = { kind, type, amount, cost, date: todayLocal(), description: kind, category: 'Other', reference: randomUUID() };
        await addTransaction(user, importTransaction(accounts, mobile, row, 'mpesa_sms'));
      }
      await addTransaction(user, importTransaction(accounts, mobile, {
        kind: 'mshwari', type: 'transfer', amount: 200, date: todayLocal(),
        description: 'Transfer to M-Shwari', category: 'Other', reference: randomUUID(),
      }, 'mpesa_sms'));
      assert.equal((await getAccountById(user, mobile.id))?.balance, 566);
      assert.equal((await getAccountById(user, cash.id))?.balance, 300);
      assert.equal((await getAccountById(user, savings.id))?.balance, 200);
      const metrics = await getNetWorthMetrics(user);
      assert.equal(metrics.netWorth, 1066);
      assert.equal(metrics.monthlyIncome, 0);
      assert.equal(metrics.monthlyExpenses, 34);
      const incoming = parseImportSource('QHL921KK90,2026-10-22,Withdrawal from M-Shwari,Completed,50,0,500').rows[0].movement!;
      const prepared = importTransaction(accounts, mobile, incoming, 'mpesa_statement');
      assert.equal(prepared.type, 'transfer');
      assert.equal(prepared.account_id, savings.id);
      assert.equal(prepared.transfer_account_id, mobile.id);
      const extra = await wallet(user, 'Second cash', 0);
      const row = { kind: 'withdraw', type: 'expense' as const, amount: 10, date: todayLocal(), description: 'Cash', category: 'Other' };
      assert.throws(() => importTransaction([...accounts, extra], mobile, row, 'mpesa_sms'), /counterpart/);
      assert.equal(importTransaction([...accounts, extra], mobile, row, 'mpesa_sms', cash.id).transfer_account_id, cash.id);
    });
  });
});

test('Nairobi defaults and receipt parsing retain dates, fees and distinct bank events', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const instant = new Date('2027-01-01T00:30:00+03:00');
    assert.equal(todayLocal(instant), '2027-01-01');
    assert.equal(mpesaDateToIso('', instant), '2027-01-01');
    assert.equal(mpesaDateToIso('30/2/26', instant), '');
    assert.equal(mpesaDateToIso('1/13/26', instant), '');
    assert.equal(parseBankSms('Equity: Your account 123456 has been credited with KES 500.00.', instant)?.date, '2027-01-01');
    const csv = parseImportSource('QHL921KK89,2026-10-22,"Payment, groceries",Completed,0,"-1,250.50",900\nQHL921KK90,2026-10-22,Failed,Failed,0,-500,900').rows;
    assert.equal(csv.filter((row) => row.movement).length, 1);
    assert.equal(csv[0].movement?.amount, 1250.50);
    assert.equal(csv[0].movement?.description, 'Payment, groceries');
    assert.match(csv[1].error!, /not successful/);
    const message = 'QHL921KK89 Confirmed. Ksh1,000.00 sent to JOHN DOE on 22/10/26 at 11:45 AM. Transaction cost, Ksh13.00.';
    assert.equal(parseSms(message)?.cost, 13);
    const first = parseBankSms('Equity: Your account 123456 has been credited with KES 500.00 on 01/01/2027 at 09:00 AM.');
    const second = parseBankSms('Equity: Your account 123456 has been credited with KES 500.00 on 01/01/2027 at 10:00 AM.');
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.reference, second.reference);
    assert.equal(first.reference, parseBankSms('Equity: Your account 123456 has been credited with KES 500.00 on 01/01/2027 at 09:00 AM.')?.reference);
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
