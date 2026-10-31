/**
 * Migration 1700000000002 — Ingest token selector/verifier split
 *
 * Problem being fixed:
 *   validateIngestToken() previously did `SELECT * FROM ingest_tokens` and ran
 *   argon2id verify against EVERY row until one matched. argon2id is
 *   deliberately expensive (64 MiB, 3 iterations), so a table with N tokens
 *   cost N hashes per ingest request — seconds of CPU and a trivial DoS vector
 *   on what is meant to be the hot path for SMS ingestion.
 *
 * Fix — the standard selector/verifier pattern:
 *   A token is issued as "<selector>.<verifier>".
 *   - selector: random, stored in plaintext, UNIQUE + indexed → O(1) lookup
 *   - verifier: random, stored only as an argon2id hash → exactly ONE verify
 *   The selector is not a secret; it only names the row. The verifier is the
 *   secret and is still never stored in recoverable form.
 *
 * Existing rows are deleted rather than backfilled: their plaintext is
 * unrecoverable by design and the token format has changed, so they could
 * never authenticate again regardless.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql('DELETE FROM ingest_tokens;');

  pgm.addColumns('ingest_tokens', {
    selector: { type: 'VARCHAR(32)', notNull: true, unique: true },
  });

  // Lookup is always by selector on the ingest hot path.
  pgm.createIndex('ingest_tokens', 'selector');
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropIndex('ingest_tokens', 'selector');
  pgm.dropColumns('ingest_tokens', ['selector']);
};
