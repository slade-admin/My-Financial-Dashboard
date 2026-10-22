-- Kenya Personal Wealth Dashboard — MVP Schema
-- PostgreSQL. All financial data persisted. No in-memory fallback for financial records.

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(30),
    country VARCHAR(10) DEFAULT 'KE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. ACCOUNTS (bank, mobile money, cash, investment — manually entered)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,                  -- e.g. "Equity Bank Savings", "M-Pesa", "Cash"
    institution VARCHAR(255),                    -- e.g. "Equity Bank", "Safaricom", "KCB"
    account_type VARCHAR(50) NOT NULL,           -- 'checking', 'savings', 'mobile_money', 'cash', 'investment', 'sacco'
    currency VARCHAR(10) DEFAULT 'KES',
    current_balance DECIMAL(16, 2) DEFAULT 0.00,
    is_asset BOOLEAN DEFAULT TRUE,               -- TRUE=asset, FALSE=liability
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TRANSACTIONS (manual entry, M-Pesa import, CSV import)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount DECIMAL(16, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KES',
    type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    category VARCHAR(100) NOT NULL,
    reference VARCHAR(100),                      -- M-Pesa receipt, bank ref, etc.
    import_source VARCHAR(50),                   -- 'manual', 'mpesa_statement', 'csv'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, reference, date)         -- Idempotency for imports
);

-- 4. ASSETS (property, vehicles, valuables — not held in an account)
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,                  -- e.g. "2BR Apartment Kilimani", "Toyota RAV4"
    category VARCHAR(100) NOT NULL,              -- 'real_estate', 'vehicle', 'electronics', 'other'
    estimated_value DECIMAL(16, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KES',
    acquisition_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. LIABILITIES (loans, credit cards, mortgages)
CREATE TABLE IF NOT EXISTS liabilities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,                  -- e.g. "KCB Personal Loan", "HELB Loan"
    creditor VARCHAR(255),                       -- e.g. "KCB Bank", "HELB", "Equity Bank"
    category VARCHAR(100) NOT NULL,              -- 'personal_loan', 'mortgage', 'car_loan', 'helb', 'credit_card', 'sacco_loan', 'other'
    principal_amount DECIMAL(16, 2) NOT NULL,
    outstanding_balance DECIMAL(16, 2) NOT NULL,
    interest_rate DECIMAL(6, 2),                 -- Annual percentage
    monthly_payment DECIMAL(16, 2),
    currency VARCHAR(10) DEFAULT 'KES',
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. BUDGETS
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    monthly_limit DECIMAL(16, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KES',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. SAVINGS GOALS
CREATE TABLE IF NOT EXISTS savings_goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,                  -- e.g. "Emergency Fund", "Land Purchase", "School Fees"
    target_amount DECIMAL(16, 2) NOT NULL,
    current_amount DECIMAL(16, 2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'KES',
    target_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. KENYAN EXPENSE CATEGORIES
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
