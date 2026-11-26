const tables = ['accounts', 'assets', 'liabilities', 'savings_goals'];

exports.up = (pgm) => {
  for (const table of tables) {
    pgm.sql(`
      ALTER TABLE ${table}
        ADD COLUMN creation_request_id UUID,
        ADD COLUMN creation_hash VARCHAR(64),
        ADD CONSTRAINT ${table}_user_creation_key UNIQUE (user_id, creation_request_id);
    `);
  }
};

exports.down = (pgm) => {
  for (const table of tables) {
    pgm.sql(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM ${table} WHERE creation_request_id IS NOT NULL) THEN
          RAISE EXCEPTION 'Cannot remove creation retry history. Restore a backup instead.';
        END IF;
      END $$;
      ALTER TABLE ${table}
        DROP CONSTRAINT ${table}_user_creation_key,
        DROP COLUMN creation_request_id,
        DROP COLUMN creation_hash;
    `);
  }
};
