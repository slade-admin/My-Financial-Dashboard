/**
 * scripts/test-ingest-token.ts  —  npm run test:ingest-token
 *
 * Verifies the Phase 2 selector/verifier rewrite of ingest tokens:
 *   1. A freshly issued token validates and returns the right user id.
 *   2. A tampered verifier is rejected.
 *   3. An unknown selector is rejected.
 *   4. Validation cost does NOT grow with the number of tokens in the table.
 *      (The previous implementation ran one argon2id verify per row, so this
 *      was O(n); it should now be flat.)
 */
import {
  createIngestToken,
  validateIngestToken,
  deleteIngestToken,
} from '../src/lib/repo/auth';
import { getPool } from '../src/lib/db';

const USER_ID = 1; // seed user

function ms(t: bigint): number {
  return Number(t) / 1e6;
}

async function timeIt(fn: () => Promise<unknown>): Promise<number> {
  const start = process.hrtime.bigint();
  await fn();
  return ms(process.hrtime.bigint() - start);
}

async function main() {
  // Same dev-only default as scripts/test-persistence.ts. Announced rather
  // than silent, so it is obvious which database the assertions ran against.
  process.env.DATABASE_URL ||=
    'postgresql://postgres:postgrespassword@localhost:5433/financial_dashboard';
  console.log(
    `[ingest-token test] database: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@')}\n`,
  );

  const pool = getPool();
  const created: number[] = [];
  let failures = 0;
  const check = (ok: boolean, label: string) => {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures++;
  };

  try {
    // 1. happy path
    const { token, row } = await createIngestToken(USER_ID, 'test-token');
    created.push(row.id);
    check((await validateIngestToken(token)) === USER_ID, 'valid token resolves to its user');

    // 2. tampered verifier
    const [sel, ver] = token.split('.');
    const flipped = ver.slice(0, -1) + (ver.endsWith('a') ? 'b' : 'a');
    check((await validateIngestToken(`${sel}.${flipped}`)) === null, 'tampered verifier rejected');

    // 3. unknown selector
    check((await validateIngestToken('deadbeefdeadbeefdeadbeef.' + ver)) === null, 'unknown selector rejected');

    // 4. malformed
    check((await validateIngestToken('no-dot-here')) === null, 'malformed token rejected');

    // 5. cost must not scale with table size
    const baseline = await timeIt(() => validateIngestToken(token));

    const BULK = 40;
    for (let i = 0; i < BULK; i++) {
      const t = await createIngestToken(USER_ID, `bulk-${i}`);
      created.push(t.row.id);
    }
    const { rows } = await pool.query<{ count: string }>('SELECT COUNT(*) FROM ingest_tokens');
    const loaded = await timeIt(() => validateIngestToken(token));

    console.log(
      `\n  tokens in table: ${rows[0].count}\n` +
        `  validate before bulk insert: ${baseline.toFixed(1)} ms\n` +
        `  validate after  bulk insert: ${loaded.toFixed(1)} ms`,
    );

    // O(n) would multiply cost by ~BULK. Allow generous slack for noise.
    check(loaded < baseline * 3 + 50, 'validation cost is flat, not O(number of tokens)');
  } finally {
    for (const id of created) await deleteIngestToken(USER_ID, id);
    await pool.end();
  }

  console.log(failures === 0 ? '\nAll ingest-token checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
