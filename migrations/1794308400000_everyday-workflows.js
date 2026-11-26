exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE record_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      entity_id INTEGER NOT NULL,
      action VARCHAR(10) NOT NULL CHECK (action IN ('create', 'update', 'reverse')),
      reason VARCHAR(500) NOT NULL,
      before_data JSONB,
      after_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX record_history_entity ON record_history(user_id, entity_type, entity_id, id DESC);
    ALTER TABLE transactions ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE budgets ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE budgets ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE goal_contributions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_id INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
      amount NUMERIC(16,2) NOT NULL CHECK (amount <> 0),
      date DATE NOT NULL,
      note VARCHAR(500) NOT NULL,
      request_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (goal_id, request_id)
    );
    CREATE INDEX goal_contributions_history ON goal_contributions(user_id, goal_id, date DESC, id DESC);
    INSERT INTO goal_contributions (user_id,goal_id,amount,date,note)
      SELECT user_id,id,current_amount,(created_at AT TIME ZONE 'Africa/Nairobi')::date,
        'Opening earmark carried forward; no money moved'
      FROM savings_goals WHERE current_amount <> 0;

    CREATE FUNCTION version_financial_record() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (to_jsonb(NEW) - 'updated_at' - 'version') = (to_jsonb(OLD) - 'updated_at' - 'version') THEN
        RETURN OLD;
      END IF;
      NEW.version := OLD.version + 1;
      NEW.updated_at := CURRENT_TIMESTAMP;
      RETURN NEW;
    END $$;
    CREATE FUNCTION audit_financial_record() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      previous JSONB;
      change_reason TEXT;
      change_action TEXT;
      entity TEXT;
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.version = OLD.version THEN RETURN NEW; END IF;
        previous := to_jsonb(OLD);
      END IF;
      entity := CASE TG_TABLE_NAME
        WHEN 'accounts' THEN 'account' WHEN 'transactions' THEN 'transaction'
        WHEN 'assets' THEN 'asset' WHEN 'liabilities' THEN 'liability'
        WHEN 'budgets' THEN 'budget' WHEN 'savings_goals' THEN 'goal' END;
      change_action := CASE WHEN TG_OP = 'INSERT' THEN 'create'
        WHEN TG_TABLE_NAME = 'transactions' AND to_jsonb(NEW)->>'voided_at' IS NOT NULL
          AND previous->>'voided_at' IS NULL THEN 'reverse' ELSE 'update' END;
      change_reason := COALESCE(NULLIF(current_setting('app.change_reason', true), ''),
        CASE WHEN TG_OP = 'INSERT' THEN 'Created'
          WHEN TG_TABLE_NAME = 'accounts' THEN 'Ledger balance or account details updated'
          WHEN change_action = 'reverse' THEN 'Import batch reversed' ELSE 'Record updated' END);
      INSERT INTO record_history (user_id,entity_type,entity_id,action,reason,before_data,after_data)
        VALUES (NEW.user_id,entity,NEW.id,change_action,change_reason,previous,to_jsonb(NEW));
      RETURN NEW;
    END $$;
  `);
  for (const table of ['accounts', 'transactions', 'assets', 'liabilities', 'budgets', 'savings_goals']) {
    pgm.sql(`
      ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      CREATE TRIGGER ${table}_version BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION version_financial_record();
      CREATE TRIGGER ${table}_history AFTER INSERT OR UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION audit_financial_record();
    `);
  }
  // Keep the migration self-contained, including the legacy names from the initial schema.
  const aliases = [
    ['Utilities (KPLC/Water)', 'Utilities & Water (KPLC)'],
    ['Airtime & Internet', 'Airtime & Internet (Safaricom)'],
    ['Transport & Fuel', 'Transport & Fuel (Matatu/Petrol)'],
    ['Shopping', 'Shopping & Essentials'],
    ['Healthcare', 'Healthcare & Pharmacy'],
    ['Education & Fees', 'Education & School Fees'],
    ['Entertainment', 'Entertainment & Dining'],
    ['Salary & Income', 'Salary & Primary Income'],
    ['Freelance & Business', 'Side Hustle & Consulting'],
    ['Transfers', 'Transfers & Remittance'],
    ['Savings & Investment', 'Savings & MMF Deposit'],
    ['Debt Repayment', 'Loan & Fuliza Repayment'],
  ];
  pgm.sql("SELECT set_config('app.change_reason', 'Unified legacy category names', true)");
  for (const [oldName, name] of aliases) {
    pgm.sql(`
      UPDATE transactions SET category='${name}' WHERE LOWER(TRIM(category))=LOWER('${oldName}');
      UPDATE budgets SET category='${name}' WHERE LOWER(TRIM(category))=LOWER('${oldName}');
      INSERT INTO categories (name,icon,color)
        SELECT '${name}',icon,color FROM categories WHERE name='${oldName}'
        ON CONFLICT (name) DO NOTHING;
      DELETE FROM categories WHERE name='${oldName}';
    `);
  }
  pgm.sql(`
    INSERT INTO categories (name,icon,color) VALUES
      ('Family & Chamas','🤝','#F472B6'),
      ('Transaction Fees','🧾','#F59E0B'),
      ('Balance Reconciliation','⚖️','#94A3B8')
      ON CONFLICT (name) DO NOTHING;
    UPDATE transactions t SET category=c.name FROM categories c
      WHERE LOWER(TRIM(t.category))=LOWER(c.name) AND t.category<>c.name;
    UPDATE budgets b SET category=c.name FROM categories c
      WHERE LOWER(TRIM(b.category))=LOWER(c.name) AND b.category<>c.name;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM record_history) OR EXISTS (SELECT 1 FROM goal_contributions) THEN
        RAISE EXCEPTION 'Cannot remove edit or contribution history. Restore a backup instead.';
      END IF;
    END $$;
  `);
  for (const table of ['accounts', 'transactions', 'assets', 'liabilities', 'budgets', 'savings_goals']) {
    pgm.sql(`
      DROP TRIGGER ${table}_history ON ${table};
      DROP TRIGGER ${table}_version ON ${table};
      ALTER TABLE ${table} DROP COLUMN version;
    `);
  }
  pgm.sql(`
    DROP FUNCTION audit_financial_record();
    DROP FUNCTION version_financial_record();
    DROP TABLE goal_contributions;
    DROP TABLE record_history;
    ALTER TABLE transactions DROP COLUMN updated_at;
    ALTER TABLE budgets DROP COLUMN updated_at, DROP COLUMN is_active;
  `);
};
