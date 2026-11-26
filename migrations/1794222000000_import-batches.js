exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE accounts ADD COLUMN account_identifier VARCHAR(40);
    CREATE TABLE import_batches (
      id UUID PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      format VARCHAR(20) NOT NULL CHECK (format IN ('sms', 'mpesa_csv')),
      source_name VARCHAR(255) NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'committed', 'reversed')),
      rows JSONB NOT NULL,
      summary JSONB NOT NULL,
      commit_hash VARCHAR(64),
      ingest_key VARCHAR(64),
      seen_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      committed_at TIMESTAMPTZ,
      reversed_at TIMESTAMPTZ,
      reversal JSONB
    );
    CREATE INDEX import_batches_user_created ON import_batches(user_id, created_at DESC, id);
    CREATE UNIQUE INDEX import_batches_pending_ingest ON import_batches(user_id, ingest_key)
      WHERE status = 'preview' AND ingest_key IS NOT NULL;
    ALTER TABLE transactions
      ADD COLUMN import_batch_id UUID REFERENCES import_batches(id),
      ADD COLUMN source_fingerprint VARCHAR(64),
      ADD COLUMN voided_at TIMESTAMPTZ;
    ALTER TABLE transactions DROP CONSTRAINT transactions_user_reference_key;
    CREATE UNIQUE INDEX transactions_active_reference_key ON transactions(user_id, reference)
      WHERE voided_at IS NULL;
    CREATE INDEX transactions_import_batch ON transactions(import_batch_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM import_batches)
        OR EXISTS (SELECT 1 FROM transactions WHERE voided_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot remove import audit history. Restore a backup instead.';
      END IF;
    END $$;
    DROP INDEX transactions_import_batch;
    DROP INDEX transactions_active_reference_key;
    ALTER TABLE transactions ADD CONSTRAINT transactions_user_reference_key UNIQUE (user_id, reference);
    ALTER TABLE transactions DROP COLUMN import_batch_id, DROP COLUMN source_fingerprint, DROP COLUMN voided_at;
    DROP TABLE import_batches;
    ALTER TABLE accounts DROP COLUMN account_identifier;
  `);
};
