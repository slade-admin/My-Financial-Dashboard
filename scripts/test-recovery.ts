import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { createBackup, databaseUrl, generateBackupKey, readBackupKey, restoreBackup } from './backup-utils';
import { withTestDatabase } from './test-db';
import { startApp } from './test-app';
import { addAccount, getAccountById } from '../src/lib/repo/accounts';
import { addAsset, updateAsset } from '../src/lib/repo/assets';
import { addLiability, updateLiability } from '../src/lib/repo/liabilities';
import { addBudget, getBudgets, updateBudget } from '../src/lib/repo/budgets';
import { addSavingsGoal, contributeToGoal } from '../src/lib/repo/savings-goals';
import { addTransaction, reconcileAccount, reverseTransaction, updateTransaction } from '../src/lib/repo/transactions';
import { createImportPreview, commitImportBatch } from '../src/lib/repo/imports';
import { exportFinancialData } from '../src/lib/repo/export';
import { createIngestToken, createUser } from '../src/lib/repo/auth';
import { getNetWorthMetrics } from '../src/lib/repo/networth';
import { todayLocal, type PersonalTransaction } from '../src/lib/repo/types';
import type { ImportBatch, ImportChoice } from '../src/lib/import-types';

const execute = promisify(execFile);

test('fictional acceptance ledger survives encrypted backup, separate restore and an application restart', { timeout: 180000 }, async () => {
  await access(path.resolve('.next', 'BUILD_ID'));
  await withTestDatabase(async ({ pool }) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'finance-recovery-'));
    const keyFile = path.join(directory, 'keys', 'pilot.backup-key');
    const backups = path.join(directory, 'backups');
    const tools = { container: process.env.TEST_PG_TOOLS_CONTAINER || undefined };
    let restored: Awaited<ReturnType<typeof restoreBackup>> | undefined;
    let restoredPool: Pool | undefined;
    let server: Awaited<ReturnType<typeof startApp>> | undefined;
    let key: Buffer | undefined;
    try {
      const credentials = { email: `${randomUUID()}@example.invalid`, password: randomUUID(), full_name: 'Fictional acceptance pilot' };
      const user = await createUser(credentials);
      const date = todayLocal();
      const previous = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
      previous.setUTCDate(0);
      const previousDate = previous.toISOString().slice(0, 10);
      const wallet = (name: string, balance: number, account_type: 'cash' | 'bank_savings' | 'mobile_money') =>
        addAccount(user.id, { name, balance, account_type, currency: 'KES', institution: 'Fictional', is_asset: true, request_id: randomUUID() });
      const bank = await wallet('Pilot bank', 1000.25, 'bank_savings');
      const mobile = await wallet('Pilot mobile', 200.10, 'mobile_money');
      const cash = await wallet('Pilot cash', 50, 'cash');
      const movement = (account_id: string | number, changes: Partial<Omit<PersonalTransaction, 'id'>>) => addTransaction(user.id, {
        account_id, amount: 1, currency: 'KES', type: 'expense', date, description: 'Fictional pilot entry',
        category: 'Other', import_source: 'manual', reference: randomUUID(), ...changes,
      });
      await movement(bank.id, { type: 'income', amount: 500.50, category: 'Salary & Primary Income' });
      const purchase = (await movement(bank.id, { amount: 25.25, fee_amount: 1.25, category: 'Food & Groceries' })).transaction;
      const transfer = { type: 'transfer' as const, amount: 100, transfer_account_id: mobile.id, fee_amount: 2.50, reference: randomUUID() };
      await movement(bank.id, transfer);
      assert.equal((await movement(bank.id, transfer)).isDuplicate, true);
      await movement(mobile.id, { type: 'transfer', amount: 40, transfer_account_id: cash.id, fee_amount: 1.10 });
      await movement(bank.id, { amount: 5.23, date: previousDate, category: 'Food & Groceries' });

      const statement = `Receipt No.,Completion Time,Details,Transaction Status,Paid In,Withdrawn,Fee\n` +
        `PIL0000001,${date} 10:00:00,Salary top up,Completed,20.50,0,0\n` +
        `PIL0000002,${date} 10:01:00,Groceries,Completed,0,10.25,0.75`;
      const approve = (batch: ImportBatch): ImportChoice[] => batch.rows.map((row) => ({
        row: row.row, decision: 'import', reviewed: true, transaction: {
          ...row.transaction!, category: row.transaction!.type === 'expense' ? 'Food & Groceries' : 'Other',
        },
      }));
      const preview = await createImportPreview(user.id, { rawText: statement, accountId: mobile.id });
      assert.equal((await getAccountById(user.id, mobile.id))?.balance, 259);
      assert.equal((await commitImportBatch(user.id, preview.id, approve(preview))).summary.imported, 2);
      const duplicate = await createImportPreview(user.id, { rawText: statement, accountId: mobile.id });
      assert.equal((await commitImportBatch(user.id, duplicate.id, approve(duplicate))).summary.duplicates, 2);
      await updateTransaction(user.id, purchase.id, { amount: 30.25, fee_amount: 1.50 }, purchase.version, 'Correct fictional receipt');
      const mistake = (await movement(cash.id, { amount: 7.35, fee_amount: 0.20 })).transaction;
      await reverseTransaction(user.id, mistake.id, mistake.version, 'Reverse fictional mistake');
      await reconcileAccount(user.id, cash.id, 89.75, date, 'Fictional closing cash count');
      const asset = await addAsset(user.id, { name: 'Fictional asset', category: 'other', estimated_value: 125, currency: 'KES' });
      await updateAsset(user.id, asset.id, { ...asset, estimated_value: 120.25 }, asset.version, 'Fictional valuation');
      const debt = await addLiability(user.id, { name: 'Fictional debt', creditor: '', category: 'other', principal_amount: 75, outstanding_balance: 75, currency: 'KES' });
      await updateLiability(user.id, debt.id, { ...debt, outstanding_balance: 70.50 }, debt.version, 'Fictional statement');
      const budget = await addBudget(user.id, { category: 'Food & Groceries', monthly_limit: 50, currency: 'KES' });
      await updateBudget(user.id, budget.id, { ...budget, monthly_limit: 35 }, budget.version, 'Fictional budget correction');
      const goal = await addSavingsGoal(user.id, { name: 'Fictional earmark', target_amount: 1000, current_amount: 50, currency: 'KES' });
      const allocation = { amount: 25.50, date, note: 'Fictional earmark', version: goal.version, request_id: randomUUID() };
      const contributed = await contributeToGoal(user.id, goal.id, allocation);
      assert.equal((await contributeToGoal(user.id, goal.id, allocation)).isDuplicate, true);
      assert.equal((await contributeToGoal(user.id, goal.id, { ...allocation, amount: -5.25, note: 'Fictional release', version: contributed.goal.version, request_id: randomUUID() })).goal.current_amount, 70.25);
      assert.deepEqual(await Promise.all([bank, mobile, cash].map(async (account) => (await getAccountById(user.id, account.id))?.balance)), [1361.27, 268.50, 89.75]);
      const expected = {
        liquidCash: 1719.52, physicalAssets: 120.25, totalAssets: 1839.77, totalLiabilities: 70.50,
        netWorth: 1769.27, debtToAssetRatio: 3.83, monthlyIncome: 521, monthlyExpenses: 46.35,
        netSavings: 474.65, savingsRate: 91.10,
      };
      assert.deepEqual(await getNetWorthMetrics(user.id), expected);
      const actualBudget = (await getBudgets(user.id))[0];
      assert.equal(actualBudget.actual_spending, 40.50);
      assert.equal(actualBudget.remaining, -5.50);
      assert.equal(actualBudget.overspent, true);
      assert.equal((await getBudgets(user.id, previousDate.slice(0, 7)))[0].actual_spending, 5.23);

      const token = await createIngestToken(user.id, 'Fictional restored-token invalidation');
      server = await startApp();
      const login = await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      assert.equal(login.status, 200);
      const cookie = login.headers.getSetCookie().find((value) => value.startsWith('tracksuite_session='))!.split(';')[0];
      await login.json();
      await server.stop();
      server = await startApp();
      const restarted = await fetch(`${server.base}/api/networth`, { headers: { Cookie: cookie } });
      assert.equal(restarted.status, 200);
      const restartedMetrics = await restarted.json();
      for (const [field, value] of Object.entries(expected)) assert.equal(restartedMetrics[field], value, field);
      await server.stop();

      await generateBackupKey(keyFile);
      key = await readBackupKey(keyFile);
      await assert.rejects(generateBackupKey(keyFile), { code: 'EEXIST' });
      assert.deepEqual(await readBackupKey(keyFile), key);
      const source = databaseUrl(process.env.DATABASE_URL, 'Isolated source');
      const before = (await exportFinancialData(user.id)).records;
      const backup = await createBackup(source, backups, key, tools);
      const bytes = await readFile(backup);
      const damaged = path.join(backups, 'damaged.finbackup');
      bytes[bytes.length - 1] ^= 1;
      await writeFile(damaged, bytes);
      const unreachable = new URL(source);
      unreachable.port = '1';
      await assert.rejects(restoreBackup(damaged, unreachable, key, tools), /authentication failed/);
      await assert.rejects(restoreBackup(backup, unreachable, randomBytes(32), tools), /authentication failed/);
      restored = await restoreBackup(backup, source, key, tools);
      assert.notEqual(restored.name, source.pathname.slice(1));
      restoredPool = new Pool({ connectionString: restored.url.toString(), max: 1 });
      assert.deepEqual((await exportFinancialData(user.id, restoredPool)).records, before);
      for (const table of ['sessions', 'ingest_tokens', 'login_attempts']) {
        assert.equal((await restoredPool.query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count, 0);
      }
      assert.ok(!(await readdir(backups)).some((file) => file.endsWith('.partial')));
      server = await startApp(restored.url.toString());
      assert.equal((await fetch(`${server.base}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
      assert.equal((await fetch(`${server.base}/api/ingest/sms`, { method: 'POST', headers: { Authorization: `Bearer ${token.token}` } })).status, 401);
      const restoredLogin = await fetch(`${server.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      assert.equal(restoredLogin.status, 200);
      const restoredCookie = restoredLogin.headers.getSetCookie().find((value) => value.startsWith('tracksuite_session='))!.split(';')[0];
      await restoredLogin.json();
      const restoredMetrics = await (await fetch(`${server.base}/api/networth`, { headers: { Cookie: restoredCookie } })).json();
      for (const [field, value] of Object.entries(expected)) assert.equal(restoredMetrics[field], value, field);
      const create = { type: 'new_account', name: 'Restored write check', account_type: 'cash', balance: 0, request_id: randomUUID() };
      const restoredBase = server.base;
      const post = () => fetch(`${restoredBase}/api/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: restoredCookie }, body: JSON.stringify(create) });
      const firstWrite = await post();
      assert.equal(firstWrite.status, 200);
      const created = (await firstWrite.json()).account;
      assert.ok(created.id > Math.max(...[bank, mobile, cash].map((account) => Number(account.id))));
      assert.equal((await (await post()).json()).account.id, created.id);
      assert.deepEqual((await exportFinancialData(user.id)).records, before, 'Restore drills must never change the source ledger');

      if (process.platform === 'win32') {
        const check = await execute('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts', 'schedule-backup.ps1'), '-WhatIf'], {
          env: { ...process.env, DATABASE_URL: source.toString(), BACKUP_KEY_FILE: keyFile, BACKUP_DIRECTORY: backups, PG_TOOLS_CONTAINER: tools.container || '' },
          timeout: 30000, windowsHide: true,
        });
        assert.match(check.stdout, /What if:/i);
        assert.match(check.stdout, /No database was accessed/);
      }
    } finally {
      try {
        await server?.stop();
        await restoredPool?.end();
        if (restored) await pool.query(`DROP DATABASE "${restored.name}" WITH (FORCE)`);
      } finally {
        key?.fill(0);
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
});
