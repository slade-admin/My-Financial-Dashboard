-- Database schema for Finance Dashboard

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    plaid_account_id VARCHAR(255) UNIQUE NOT NULL,
    institution_name VARCHAR(255),
    account_name VARCHAR(255),
    account_type VARCHAR(50),
    account_subtype VARCHAR(50),
    mask VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id),
    plaid_transaction_id VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    date DATE NOT NULL,
    merchant_name VARCHAR(255),
    category VARCHAR(100),
    payment_channel VARCHAR(50),
    pending BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7)
);

-- Insert default categories
INSERT INTO categories (name, icon, color) VALUES
('Food & Dining', '🍔', '#FF6B6B'),
('Transportation', '🚗', '#4ECDC4'),
('Shopping', '🛍️', '#45B7D1'),
('Entertainment', '🎬', '#96CEB4'),
('Bills & Utilities', '💡', '#FFEAA7'),
('Healthcare', '🏥', '#DDA0DD'),
('Education', '📚', '#98D8C8'),
('Income', '💰', '#52B788'),
('Transfer', '🔄', '#95A5A6'),
('Other', '📦', '#BDC3C7')
ON CONFLICT (name) DO NOTHING;
