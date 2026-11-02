/**
 * scripts/test-dates.ts  —  npm run test:dates
 *
 * Regression guard for the date off-by-one.
 *
 * A SQL DATE is a calendar date with no time and no zone. node-pg used to
 * hydrate it into a JS Date at LOCAL midnight, and the repo mappers then
 * called .toISOString().split('T')[0] on it — which converts to UTC and
 * therefore rolls the calendar date back a day in any timezone ahead of UTC.
 * In EAT (UTC+3) a transaction stored as 2026-10-31 came back as 2026-10-30.
 *
 * This asserts the round trip is lossless: what we write is what we read.
 */
import { loadLocalEnv, maskUrl } from './load-env';
import { toDateString, todayLocal } from '../src/lib/repo/types';

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required. Set it in .env.local or pass it inline.');
    process.exit(1);
  }
  console.log(`[date test] database: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(`[date test] host timezone offset: ${-new Date().getTimezoneOffset() / 60}h from UTC\n`);

  // Import after env is loaded, since db.ts reads DATABASE_URL on first use.
  const { getPool } = await import('../src/lib/db');
  const { addTransaction, getTransactions } = await import('../src/lib/repo/transactions');
  const { getAccounts, addAccount } = await import('../src/lib/repo/accounts');

  const pool = getPool();
  const USER = 1;
  let failures = 0;
  const check = (ok: boolean, label: string, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
    if (!ok) failures++;
  };

  // --- pure helper, no database ---
  const localMidnight = new Date(2026, 9, 31, 0, 0, 0); // 31 Oct 2026, local
  check(toDateString(localMidnight) === '2026-10-31',
        'toDateString keeps the calendar date for a local-midnight Date',
        `-> ${toDateString(localMidnight)}`);
  check(toDateString('2026-10-31') === '2026-10-31', 'toDateString passes strings through');
  check(toDateString(null) === undefined, 'toDateString handles null');

  // The old implementation, shown failing for contrast.
  const oldWay = localMidnight.toISOString().split('T')[0];
  console.log(`  (previous implementation produced ${oldWay} for the same Date)`);

  // --- round trip through Postgres ---
  const accounts = await getAccounts(USER);
  const acct = accounts[0] ?? (await addAccount(USER, {
    name: 'Date Test Account', institution: 'test', account_type: 'cash',
    currency: 'KES', balance: 0, is_asset: true,
  }));

  const cases = ['2026-10-31', '2026-01-01', '2026-12-31', todayLocal()];
  const refs: string[] = [];
  try {
    for (const want of cases) {
      const ref = `DATETEST${Date.now()}${Math.floor(Math.random() * 1000)}`;
      refs.push(ref);
      await addTransaction(USER, {
        account_id: acct.id, amount: 1, currency: 'KES', type: 'expense',
        date: want, description: 'date round-trip test', category: 'Other',
        reference: ref, import_source: 'manual',
      });
      const rows = await getTransactions(USER, { limit: 200 });
      const got = rows.find((t) => t.reference === ref)?.date;
      check(got === want, `round trip ${want}`, `-> read back ${got}`);
    }
  } finally {
    for (const r of refs) {
      await pool.query('DELETE FROM transactions WHERE user_id = $1 AND reference = $2', [USER, r]);
    }
    await pool.end();
  }

  console.log(failures === 0 ? '\nAll date checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
