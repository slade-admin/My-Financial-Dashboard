exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE accounts ADD COLUMN opening_balance NUMERIC(16,2);
    UPDATE accounts a SET opening_balance = current_balance - COALESCE((
      SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount
                      WHEN t.type = 'expense' THEN -t.amount ELSE 0 END)
      FROM transactions t WHERE t.account_id = a.id AND t.user_id = a.user_id
    ), 0);
    ALTER TABLE accounts ALTER COLUMN opening_balance SET NOT NULL;
    ALTER TABLE accounts ALTER COLUMN opening_balance SET DEFAULT 0;

    ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
      CHECK (type IN ('income', 'expense', 'transfer', 'adjustment'));
    ALTER TABLE transactions
      ADD COLUMN transfer_account_id INTEGER REFERENCES accounts(id),
      ADD COLUMN fee_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
      ADD COLUMN fee_account_id INTEGER REFERENCES accounts(id),
      ADD COLUMN parent_transaction_id INTEGER REFERENCES transactions(id);
    CREATE UNIQUE INDEX transactions_one_fee_per_parent
      ON transactions(parent_transaction_id) WHERE parent_transaction_id IS NOT NULL;
    CREATE INDEX idx_transactions_transfer_account ON transactions(transfer_account_id);
    ALTER TABLE transactions ADD CONSTRAINT transactions_distinct_transfer_accounts
      CHECK (transfer_account_id IS NULL OR (type = 'transfer' AND transfer_account_id <> account_id));
  `);
  for (const table of ['accounts', 'transactions', 'assets', 'liabilities', 'budgets', 'savings_goals']) {
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_kes_only
      CHECK (currency IS NOT NULL AND currency = 'KES') NOT VALID;`);
  }
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM transactions
        WHERE type = 'adjustment' OR transfer_account_id IS NOT NULL
          OR fee_amount <> 0 OR parent_transaction_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot remove ledger schema with financial entries. Restore a backup instead.';
      END IF;
    END $$;
  `);
  for (const table of ['accounts', 'transactions', 'assets', 'liabilities', 'budgets', 'savings_goals']) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_kes_only;`);
  }
  pgm.sql(`
    ALTER TABLE transactions DROP CONSTRAINT transactions_distinct_transfer_accounts;
    DROP INDEX idx_transactions_transfer_account;
    DROP INDEX transactions_one_fee_per_parent;
    ALTER TABLE transactions DROP COLUMN parent_transaction_id, DROP COLUMN fee_account_id,
      DROP COLUMN fee_amount, DROP COLUMN transfer_account_id;
    ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
      CHECK (type IN ('income', 'expense', 'transfer'));
    ALTER TABLE accounts DROP COLUMN opening_balance;
  `);
};
