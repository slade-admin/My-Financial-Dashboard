import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { addAccount, getAccountById } from '../src/lib/repo/accounts';
import { addTransaction, getTransactions } from '../src/lib/repo/transactions';
import { getNetWorthMetrics, getExpensesByCategory } from '../src/lib/repo/networth';
import {
  createImportPreview, commitImportBatch, getImportBatch, getImportBatches,
  getImportReversalPreview, reverseImportBatch, discardImportPreview,
} from '../src/lib/repo/imports';
import { ingestSms } from '../src/lib/repo/ingestion';
import { parseImportSource } from '../src/lib/import-parser';
import { parseBankSms } from '../src/lib/bank-sms';
import { todayLocal, type PersonalAccount } from '../src/lib/repo/types';
import type { ImportBatch, ImportChoice } from '../src/lib/import-types';
import { createTestUser, withTestDatabase } from './test-db';

const date = todayLocal();
const smsDate = `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
const receipt = (id: number) => `IMP${String(id).padStart(7, '0')}`;
const incoming = (id: number, amount = '10.00') =>
  `${receipt(id)} Confirmed. You have received Ksh${amount} from SAMPLE PERSON on ${smsDate} at 10:00 AM.`;
const payment = (id: number, amount = '5.00', fee = '1.25') =>
  `${receipt(id)} Confirmed. Ksh${amount} paid to MERCHANT on ${smsDate} at 10:00 AM. Transaction cost, Ksh${fee}.`;
const withdrawal = (id: number) =>
  `${receipt(id)} Confirmed. Ksh20.00 withdrawn from AGENT on ${smsDate} at 10:00 AM. Transaction cost, Ksh2.00.`;
const wallet = (user: number, name: string, balance = 100, extra: Partial<PersonalAccount> = {}) =>
  addAccount(user, { name, balance, institution: 'Safaricom', account_type: 'mobile_money', currency: 'KES', is_asset: true, ...extra });
const approve = (batch: ImportBatch): ImportChoice[] => batch.rows.map((row) => ({
  row: row.row, decision: row.transaction && !row.error ? 'import' : 'skip', reviewed: true, transaction: row.transaction,
}));

test('import parsing preserves records and exposes unsafe input', () => {
  const parsed = parseImportSource('\uFEFF' +
    '"Receipt No.","Completion Time","Details","Transaction Status","Paid In","Withdrawn","Balance","Fee"\n' +
    `"${receipt(1)}","2026-10-22 09:00:00","A ""quoted"",\nmerchant","Completed","0.00","(1,250.50)","8,000.00","13.00"\n` +
    `${receipt(2)},2026-10-22,Failed event,Failed,0,50,8000,0\n` +
    `${receipt(3)},2026-10-22,Bad amount,Completed,0,"12,34",8000,0\n` +
    `${receipt(4)},2026-02-31,Bad date,Completed,0,10,8000,0\n` +
    `${receipt(5)},2026-10-22,Income,Completed,500,0,8500,0\n` +
    `${receipt(6)},2026-10-22,Both flows,Completed,50,10,8500,0\n` +
    `${receipt(7)},2026-10-22,Extra column,Completed,50,0,8500,0,extra`);
  assert.equal(parsed.format, 'mpesa_csv');
  assert.equal(parsed.rows.length, 7);
  assert.equal(parsed.rows[0].movement?.description, 'A "quoted",\nmerchant');
  assert.equal(parsed.rows[0].movement?.amount, 1250.50);
  assert.equal(parsed.rows[0].movement?.cost, 13);
  assert.match(parsed.rows[0].raw, /\nmerchant/);
  assert.equal(parsed.rows[0].line, 3);
  assert.equal(parsed.rows.filter((row) => row.error).length, 5);
  assert.match(parsed.rows[1].error!, /not successful/);
  assert.match(parsed.rows[2].error!, /monetary/);
  assert.match(parsed.rows[3].error!, /date/i);
  assert.match(parsed.rows[5].error!, /Exactly one/);
  assert.match(parsed.rows[6].error!, /number of CSV/);
  assert.throws(() => parseImportSource('"Receipt No.","unterminated', 'mpesa_csv'), /CSV syntax error/);
  assert.throws(() => parseImportSource('x'.repeat(5 * 1024 * 1024 + 1)), /5 MB/);
  assert.throws(() => parseImportSource('unrecognised\n'.repeat(10001), 'sms'), /10,000 rows/);

  const mixed = parseImportSource(`${payment(1).replace('Transaction cost', '\nTransaction cost')}\nnot a record\n${incoming(2)}`);
  assert.equal(mixed.rows.length, 3);
  assert.equal(mixed.rows[0].movement?.cost, 1.25);
  assert.ok(mixed.rows[1].error);
  const undated = parseImportSource(`${receipt(3)} Confirmed. You have received Ksh10.00 from SAMPLE PERSON.`);
  assert.equal(undated.rows[0].movement?.date, '');
  assert.match(undated.rows[0].warnings.join(' '), /actual date/);
  assert.equal(undated.rows[0].movement?.source, 'mpesa');
  const historical = parseImportSource(payment(4).replace(smsDate, '22/10/24'));
  assert.equal(historical.rows[0].movement?.date, '2024-10-22');
  const datedName = parseImportSource(incoming(5).replace('SAMPLE PERSON', 'SHOP 12/12/24'));
  assert.equal(datedName.rows[0].movement?.date, date);
  const bank = parseBankSms(`KCB: Balance KES 5,000.00. KES 125.50 debited from account 1234 on ${date}. Ref BANK1234. Fee KES 2.00.`);
  assert.equal(bank?.amount, 125.50);
  assert.equal(bank?.classificationNeedsReview, true);
  assert.equal(parseBankSms(`KCB: KES 12,34 debited from account 1234 on ${date}. Ref BANK1234.`), null);
});

test('reviewed import lifecycle', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    await t.test('preview has no financial effects and counts rejected and review rows separately', async () => {
      const user = await createTestUser(pool);
      const account = await wallet(user, 'Preview');
      await assert.rejects(createImportPreview(user, { rawText: incoming(1) }), /Choose an owned account/);
      const batch = await createImportPreview(user, {
        accountId: account.id, rawText: `${incoming(1)}\nunsupported record\n${receipt(2)} Confirmed. You have received Ksh10.00 from SAMPLE PERSON.`,
      });
      assert.equal(batch.summary.ready, 1);
      assert.equal(batch.summary.review, 1);
      assert.equal(batch.summary.rejected, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 100);
      assert.equal((await getTransactions(user)).length, 0);
      assert.deepEqual((await getImportBatch(user, batch.id)).rows, batch.rows);
      const choices = approve(batch);
      choices[2].reviewed = false;
      await assert.rejects(commitImportBatch(user, batch.id, choices), /date|warnings/i);
      assert.equal((await getTransactions(user)).length, 0);
      choices[2].decision = 'skip';
      const committed = await commitImportBatch(user, batch.id, choices);
      assert.equal(committed.summary.imported, 1);
      assert.equal(committed.summary.rejected, 1);
      assert.equal(committed.summary.skipped, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 110);
    });

    await t.test('concurrent confirmations post paired transfers and fees once and undo both wallets exactly', async () => {
      const user = await createTestUser(pool);
      const source = await wallet(user, 'M-PESA');
      const cash = await wallet(user, 'Cash', 0, { account_type: 'cash' });
      const batch = await createImportPreview(user, {
        accountId: source.id, counterpartAccountId: cash.id,
        rawText: [incoming(10), payment(11), withdrawal(12)].join('\n'),
      });
      const choices = approve(batch);
      const results = await Promise.all([commitImportBatch(user, batch.id, choices), commitImportBatch(user, batch.id, choices)]);
      assert.ok(results.every((result) => result.summary.imported === 3));
      assert.equal((await getTransactions(user)).length, 5);
      assert.equal((await getAccountById(user, source.id))?.balance, 81.75);
      assert.equal((await getAccountById(user, cash.id))?.balance, 20);
      const metrics = await getNetWorthMetrics(user);
      assert.equal(metrics.monthlyIncome, 10);
      assert.equal(metrics.monthlyExpenses, 8.25);
      assert.equal(metrics.netWorth, 101.75);
      const changed = approve(batch);
      changed[0].transaction = { ...changed[0].transaction!, amount: 11 };
      await assert.rejects(commitImportBatch(user, batch.id, changed), /different decisions/);
      const undo = await getImportReversalPreview(user, batch.id);
      assert.equal(undo.find((effect) => effect.accountId === source.id)?.change, 18.25);
      assert.equal(undo.find((effect) => effect.accountId === cash.id)?.change, -20);
      await Promise.all([reverseImportBatch(user, batch.id), reverseImportBatch(user, batch.id)]);
      assert.equal((await getAccountById(user, source.id))?.balance, 100);
      assert.equal((await getAccountById(user, cash.id))?.balance, 0);
      assert.equal((await getTransactions(user)).length, 0);
      assert.equal((await getNetWorthMetrics(user)).monthlyExpenses, 0);
      assert.equal((await getExpensesByCategory(user)).length, 0);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM transactions WHERE user_id=$1 AND voided_at IS NOT NULL', [user])).rows[0].count, 5);
    });

    await t.test('stale reference conflicts roll back the entire batch, not just the conflicting row', async () => {
      const user = await createTestUser(pool);
      const account = await wallet(user, 'Conflict');
      const batch = await createImportPreview(user, { accountId: account.id, rawText: `${incoming(20)}\n${incoming(21)}` });
      await addTransaction(user, { ...batch.rows[1].transaction!, amount: 200 });
      await assert.rejects(commitImportBatch(user, batch.id, approve(batch)), /different transaction/);
      assert.equal((await getTransactions(user)).length, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 300);
      assert.equal((await getImportBatch(user, batch.id)).status, 'preview');
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM transactions WHERE import_batch_id=$1', [batch.id])).rows[0].count, 0);
      const corrected = approve(batch);
      corrected[1].decision = 'skip';
      assert.equal((await commitImportBatch(user, batch.id, corrected)).summary.imported, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 310);
    });

    await t.test('a real balance-write failure rolls back all rows, linked fees, balances and batch status', async () => {
      const user = await createTestUser(pool);
      const source = await wallet(user, 'Rollback source');
      const cash = await wallet(user, 'Rollback cash', 0, { account_type: 'cash' });
      const batch = await createImportPreview(user, { accountId: source.id, counterpartAccountId: cash.id, rawText: `${incoming(30)}\n${withdrawal(31)}` });
      await pool.query(`CREATE FUNCTION fail_import_balance() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.id=${Number(cash.id)} THEN RAISE EXCEPTION 'Injected import balance failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_import_balance BEFORE UPDATE OF current_balance ON accounts
        FOR EACH ROW EXECUTE FUNCTION fail_import_balance();`);
      try {
        await assert.rejects(commitImportBatch(user, batch.id, approve(batch)), /Injected import balance failure/);
        assert.equal((await getTransactions(user)).length, 0);
        assert.equal((await getAccountById(user, source.id))?.balance, 100);
        assert.equal((await getAccountById(user, cash.id))?.balance, 0);
        assert.equal((await getImportBatch(user, batch.id)).status, 'preview');
      } finally {
        await pool.query('DROP TRIGGER fail_import_balance ON accounts; DROP FUNCTION fail_import_balance();');
      }
      assert.equal((await commitImportBatch(user, batch.id, approve(batch))).summary.imported, 2);
    });

    await t.test('undo preserves pre-existing duplicates and later entries and permits legitimate reimport', async () => {
      const user = await createTestUser(pool);
      const account = await wallet(user, 'Undo');
      const original = await createImportPreview(user, { accountId: account.id, rawText: incoming(40, '50.00') });
      await commitImportBatch(user, original.id, approve(original));
      const expense = payment(41, '100.00', '2.50');
      const batch = await createImportPreview(user, { accountId: account.id, rawText: `${incoming(40, '50.00')}\n${expense}\n${expense}` });
      const committed = await commitImportBatch(user, batch.id, approve(batch));
      assert.equal(committed.summary.imported, 1);
      assert.equal(committed.summary.duplicates, 2);
      const later = await createImportPreview(user, { accountId: account.id, rawText: incoming(42, '9.00') });
      await commitImportBatch(user, later.id, approve(later));
      assert.equal((await getAccountById(user, account.id))?.balance, 56.50);
      assert.equal((await getImportReversalPreview(user, batch.id))[0].after, 159);
      const reversed = await reverseImportBatch(user, batch.id);
      assert.equal(reversed.reversal?.transactions, 2);
      assert.equal((await getAccountById(user, account.id))?.balance, 159);
      assert.equal((await getTransactions(user)).length, 2);
      assert.deepEqual(await reverseImportBatch(user, batch.id), reversed);
      await assert.rejects(commitImportBatch(user, batch.id, approve(batch)), /was reversed/);
      await assert.rejects(discardImportPreview(user, batch.id), /pending previews/);
      const again = await createImportPreview(user, { accountId: account.id, rawText: expense });
      assert.equal((await commitImportBatch(user, again.id, approve(again))).summary.imported, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 56.50);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM transactions WHERE user_id=$1 AND voided_at IS NOT NULL', [user])).rows[0].count, 2);
      assert.equal((await getImportBatch(user, batch.id)).status, 'reversed');
    });

    await t.test('ownership and review validation apply to history, preview, confirmation, discard and undo', async () => {
      const user = await createTestUser(pool), other = await createTestUser(pool);
      const account = await wallet(user, 'Owned'), foreign = await wallet(other, 'Foreign');
      await assert.rejects(createImportPreview(user, { accountId: foreign.id, rawText: incoming(50) }), /owned account/);
      await assert.rejects(createImportPreview(user, { accountId: account.id, counterpartAccountId: foreign.id, rawText: withdrawal(50) }), /Counterpart account/);
      const batch = await createImportPreview(user, { accountId: account.id, rawText: incoming(50) });
      assert.equal((await getImportBatches(other)).batches.length, 0);
      await assert.rejects(getImportBatch(other, batch.id), /not found/);
      await assert.rejects(commitImportBatch(other, batch.id, approve(batch)), /not found/);
      await assert.rejects(reverseImportBatch(other, batch.id), /not found/);
      await assert.rejects(getImportReversalPreview(other, batch.id), /not found/);
      await assert.rejects(discardImportPreview(other, batch.id), /pending previews/);
      const foreignChoice = approve(batch);
      foreignChoice[0].transaction = { ...foreignChoice[0].transaction!, account_id: foreign.id };
      await assert.rejects(commitImportBatch(user, batch.id, foreignChoice), /not owned/);
      const badReceipt = approve(batch);
      badReceipt[0].transaction = { ...badReceipt[0].transaction!, reference: 'NOT-A-RECEIPT' };
      await assert.rejects(commitImportBatch(user, batch.id, badReceipt), /ten-character/);
      await assert.rejects(commitImportBatch(user, batch.id, [approve(batch)[0], approve(batch)[0]]), /repeated row/);
      assert.equal((await getTransactions(user)).length, 0);
      await discardImportPreview(user, batch.id);
      await assert.rejects(getImportBatch(user, batch.id), /not found/);
    });

    await t.test('bank identifiers distinguish same-bank accounts and ambiguous classifications wait for review', async () => {
      const user = await createTestUser(pool);
      const a = await wallet(user, 'KCB A', 0, { institution: 'KCB', account_type: 'bank_checking', account_identifier: '11111234' });
      const b = await wallet(user, 'KCB B', 0, { institution: 'KCB', account_type: 'bank_savings', account_identifier: '22225678' });
      const message = `KCB salary: KES 50.00 credited to account 5678 on ${date} at 09:15. Ref SALARYB1. Balance KES 50.00.`;
      const preview = await createImportPreview(user, { accountId: a.id, rawText: message });
      assert.equal(preview.rows[0].transaction?.account_id, b.id);
      const saved = await ingestSms(user, { message });
      assert.ok(saved && !saved.needsReview);
      assert.equal(saved.account.id, b.id);
      assert.equal(saved.parsed.institution, 'KCB Bank');
      assert.equal(saved.parsed.balance, 50);
      assert.equal((await getAccountById(user, a.id))?.balance, 0);
      assert.equal((await getAccountById(user, b.id))?.balance, 50);
      const mismatch = await ingestSms(user, { message: message.replace('SALARYB1', 'SALARYB2'), accountId: a.id });
      assert.ok(mismatch?.needsReview);
      const generic = await ingestSms(user, { message: message.replace('salary:', 'alert:').replace('SALARYB1', 'GENERIC1') });
      assert.ok(generic?.needsReview);
      assert.equal((await getTransactions(user)).length, 1);
    });

    await t.test('weak forwarded identities queue without financial effects and retain retry versus event evidence', async () => {
      const user = await createTestUser(pool);
      const account = await wallet(user, 'KCB', 0, { institution: 'KCB', account_type: 'bank_checking', account_identifier: '5678' });
      const message = `KCB salary: KES 10.00 credited to account 5678 on ${date} at 09:15. Balance KES 50.00.`;
      const first = await ingestSms(user, { message, receivedAt: `${date}T10:00:00Z` });
      assert.ok(first?.needsReview);
      const retries = await Promise.all([
        ingestSms(user, { message, receivedAt: `${date}T10:00:00Z` }),
        ingestSms(user, { message, receivedAt: `${date}T10:00:00Z` }),
      ]);
      assert.ok(retries.every((result) => result?.needsReview && result.batchId === first.batchId));
      const batch = await getImportBatch(user, first.batchId);
      assert.equal(batch.seenCount, 3);
      const second = await ingestSms(user, { message, receivedAt: `${date}T10:01:00Z` });
      assert.ok(second?.needsReview && second.batchId !== first.batchId);
      assert.equal((await getTransactions(user)).length, 0);
      assert.equal((await getAccountById(user, account.id))?.balance, 0);
      await commitImportBatch(user, batch.id, approve(batch));
      const distinct = await getImportBatch(user, second.batchId);
      const choices = approve(distinct);
      choices[0].transaction = { ...choices[0].transaction!, reference: `REVIEW-${randomUUID()}` };
      assert.equal((await commitImportBatch(user, distinct.id, choices)).summary.imported, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 20);
    });

    await t.test('different bank event times remain distinct after review and changed receipts need an explicit duplicate decision', async () => {
      const user = await createTestUser(pool);
      const account = await wallet(user, 'KCB', 0, { institution: 'KCB', account_type: 'bank_checking', account_identifier: '1234' });
      const message = `KCB salary: KES 10.00 credited to account 1234 on ${date} at 09:15.`;
      const first = await ingestSms(user, { message });
      const second = await ingestSms(user, { message: message.replace('09:15', '10:15') });
      assert.ok(first?.needsReview);
      assert.ok(second?.needsReview);
      const firstBatch = await getImportBatch(user, first.batchId);
      const secondBatch = await getImportBatch(user, second.batchId);
      assert.notEqual(firstBatch.rows[0].transaction?.reference, secondBatch.rows[0].transaction?.reference);
      assert.equal((await getAccountById(user, account.id))?.balance, 0);
      await commitImportBatch(user, firstBatch.id, approve(firstBatch));
      await commitImportBatch(user, secondBatch.id, approve(secondBatch));
      assert.equal((await getAccountById(user, account.id))?.balance, 20);
      const withReference = `${message} Ref REUSED01.`;
      await ingestSms(user, { message: withReference });
      const changed = await ingestSms(user, { message: withReference.replace('09:15', '11:15') });
      assert.ok(changed?.needsReview);
      const batch = await getImportBatch(user, changed.batchId);
      assert.equal(batch.rows[0].status, 'conflict');
      await assert.rejects(commitImportBatch(user, batch.id, approve(batch)), /bank receipt/);
      const choices = approve(batch);
      choices[0].decision = 'duplicate';
      assert.equal((await commitImportBatch(user, batch.id, choices)).summary.duplicates, 1);
      assert.equal((await getAccountById(user, account.id))?.balance, 30);
    });

    await t.test('unambiguous phone deliveries remain idempotent and unknown dates do not become today', async () => {
      const user = await createTestUser(pool);
      const first = await ingestSms(user, { message: incoming(60) });
      assert.ok(first && !first.needsReview && !first.duplicate);
      const retry = await ingestSms(user, { message: incoming(60) });
      assert.ok(retry && !retry.needsReview && retry.duplicate);
      await assert.rejects(ingestSms(user, { message: `${incoming(62)}\n${incoming(63)}` }), /one SMS at a time/);
      assert.equal((await getAccountById(user, first.account.id))?.balance, 10);
      const pending = await ingestSms(user, { message: `${receipt(61)} Confirmed. You have received Ksh20.00 from SAMPLE PERSON.` });
      assert.ok(pending?.needsReview);
      const batch = await getImportBatch(user, pending.batchId);
      assert.equal(batch.rows[0].transaction?.date, '');
      const choices = approve(batch);
      choices[0].transaction = { ...choices[0].transaction!, date };
      await commitImportBatch(user, batch.id, choices);
      assert.equal((await getAccountById(user, first.account.id))?.balance, 30);
      assert.equal(await ingestSms(user, { message: 'not a supported transaction' }), null);
    });
  });
});
