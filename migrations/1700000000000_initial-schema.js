exports.up = (pgm) => {
  pgm.sql(`
    -- 1. USERS
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(30),
      country VARCHAR(10) DEFAULT 'KE',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. ACCOUNTS
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      institution VARCHAR(255),
      account_type VARCHAR(50) NOT NULL,
      currency VARCHAR(10) DEFAULT 'KES',
      current_balance NUMERIC(16, 2) DEFAULT 0.00 NOT NULL,
      is_asset BOOLEAN DEFAULT TRUE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

    -- 3. TRANSACTIONS
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount NUMERIC(16, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'KES',
      type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
      date DATE NOT NULL,
      description VARCHAR(500) NOT NULL,
      category VARCHAR(100) NOT NULL,
      reference VARCHAR(100),
      import_source VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT transactions_user_reference_key UNIQUE (user_id, reference)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id_date ON transactions(user_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);

    -- 4. ASSETS
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      estimated_value NUMERIC(16, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'KES',
      acquisition_date DATE,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);

    -- 5. LIABILITIES
    CREATE TABLE IF NOT EXISTS liabilities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      creditor VARCHAR(255),
      category VARCHAR(100) NOT NULL,
      principal_amount NUMERIC(16, 2) NOT NULL,
      outstanding_balance NUMERIC(16, 2) NOT NULL,
      interest_rate NUMERIC(6, 2),
      monthly_payment NUMERIC(16, 2),
      currency VARCHAR(10) DEFAULT 'KES',
      due_date DATE,
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_liabilities_user_id ON liabilities(user_id);

    -- 6. BUDGETS
    CREATE TABLE IF NOT EXISTS budgets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(100) NOT NULL,
      monthly_limit NUMERIC(16, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'KES',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);

    -- 7. SAVINGS GOALS
    CREATE TABLE IF NOT EXISTS savings_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      target_amount NUMERIC(16, 2) NOT NULL,
      current_amount NUMERIC(16, 2) DEFAULT 0.00 NOT NULL,
      currency VARCHAR(10) DEFAULT 'KES',
      target_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals(user_id);

    -- 8. CATEGORIES
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      icon VARCHAR(10),
      color VARCHAR(10)
    );

    INSERT INTO categories (name, icon, color) VALUES
    ('Food & Groceries', '🛒', '#F87171'),
    ('Rent & Housing', '🏠', '#818CF8'),
    ('Utilities (KPLC/Water)', '💡', '#FBBF24'),
    ('Airtime & Internet', '📶', '#34D399'),
    ('Transport & Fuel', '⛽', '#60A5FA'),
    ('Shopping', '🛍️', '#A78BFA'),
    ('Healthcare', '🏥', '#F472B6'),
    ('Education & Fees', '📚', '#38BDF8'),
    ('Entertainment', '🎬', '#E879F9'),
    ('Salary & Income', '💰', '#10B981'),
    ('Freelance & Business', '💼', '#059669'),
    ('Transfers', '🔄', '#9CA3AF'),
    ('Savings & Investment', '📈', '#6366F1'),
    ('Debt Repayment', '🏛️', '#EF4444'),
    ('Other', '📦', '#6B7280')
    ON CONFLICT (name) DO UPDATE
    SET icon = EXCLUDED.icon, color = EXCLUDED.color;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS categories CASCADE;
    DROP TABLE IF EXISTS savings_goals CASCADE;
    DROP TABLE IF EXISTS budgets CASCADE;
    DROP TABLE IF EXISTS liabilities CASCADE;
    DROP TABLE IF EXISTS assets CASCADE;
    DROP TABLE IF EXISTS transactions CASCADE;
    DROP TABLE IF EXISTS accounts CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
};
