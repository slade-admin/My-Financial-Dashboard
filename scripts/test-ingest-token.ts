import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIngestToken,
  validateIngestToken,
  deleteIngestToken,
  listIngestTokens,
} from '../src/lib/repo/auth';
import { createTestUser, withTestDatabase } from './test-db';

async function averageValidationMs(token: string): Promise<number> {
  const start = process.hrtime.bigint();
  for (let i = 0; i < 3; i++) await validateIngestToken(token);
  return Number(process.hrtime.bigint() - start) / 1e6 / 3;
}

test('ingest tokens reject tampering, enforce ownership and support revocation', async (t) => {
  await withTestDatabase(async ({ pool }) => {
    const userId = await createTestUser(pool);
    const otherId = await createTestUser(pool);
    const { token, row } = await createIngestToken(userId, 'Test Token');

    assert.equal(await validateIngestToken(token), userId);
    const [selector, verifier] = token.split('.');
    const tampered = verifier.slice(0, -1) + (verifier.endsWith('a') ? 'b' : 'a');
    assert.equal(await validateIngestToken(`${selector}.${tampered}`), null);
    assert.equal(await validateIngestToken(`deadbeefdeadbeefdeadbeef.${verifier}`), null);
    assert.equal(await validateIngestToken('no-dot-here'), null);
    assert.deepEqual(await listIngestTokens(otherId), []);
    const listed = await listIngestTokens(userId);
    assert.equal(listed[0].id, row.id);
    assert.equal('token_hash' in listed[0], false);
    assert.equal('selector' in listed[0], false);
    await deleteIngestToken(otherId, row.id);
    assert.equal(await validateIngestToken(token), userId);

    await t.test('validation cost stays flat as the token table grows', async () => {
      const baseline = await averageValidationMs(token);
      // Reuse a fixture hash rather than spending CPU issuing 40 real tokens.
      await pool.query(
        `INSERT INTO ingest_tokens (user_id, selector, token_hash, label)
         SELECT $1, md5(n::text), token_hash, 'Bulk Test Token'
         FROM ingest_tokens CROSS JOIN generate_series(1, 40) AS n
         WHERE id = $2`,
        [otherId, row.id],
      );
      const loaded = await averageValidationMs(token);
      assert.ok(
        loaded < baseline * 3 + 50,
        `Validation grew from ${baseline.toFixed(1)} ms to ${loaded.toFixed(1)} ms`,
      );
    });

    await deleteIngestToken(userId, row.id);
    assert.equal(await validateIngestToken(token), null);
  });
});
