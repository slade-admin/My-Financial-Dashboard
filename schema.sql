-- =====================================================================
-- KENYA FINANCIAL DASHBOARD & ECOSYSTEM DATABASE SCHEMA
-- Native East Africa Financial Rails:
--   - Safaricom M-Pesa Daraja 2.0 (STK Push, C2B, B2C, Real-time callbacks)
--   - Kenyan Direct Banking (Equity Jenga, KCB Buni, Co-op Bank, StanChart)
--   - Unified Checkout & Aggregators (PayPal, Pesapal, Cards, Mobile Money)
--   - KRA eTIMS Fiscal Compliance & Accounting Sync (VSCU/OSCU, CUIN, QR Codes)
--   - Wealth Domain (CBK T-Bills, IFB Bonds, Money Market Funds, NSE Equities)
-- =====================================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(30) NOT NULL, -- e.g. 254712345678
    kra_pin VARCHAR(20),               -- e.g. A012345678Z for eTIMS compliance
    business_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'individual', -- 'individual', 'business', 'sole_proprietor'
    country VARCHAR(10) DEFAULT 'KE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. FINANCIAL ACCOUNTS
CREATE TABLE IF NOT EXISTS financial_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    institution_code VARCHAR(50) NOT NULL, -- 'SAFARICOM', 'EQUITY', 'KCB', 'COOP', 'SCB', 'PAYPAL', 'CIC_MMF'
    institution_name VARCHAR(255) NOT NULL,
    account_number_mask VARCHAR(50) NOT NULL, -- e.g. '2547****456' or '****7890'
    account_type VARCHAR(50) NOT NULL, -- 'M-Pesa Wallet', 'Checking', 'Savings', 'MMF', 'Treasury Bond'
    currency VARCHAR(10) DEFAULT 'KES',
    available_balance DECIMAL(16, 2) DEFAULT 0.00,
    actual_balance DECIMAL(16, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. UNIFIED FINANCIAL TRANSACTIONS
CREATE TABLE IF NOT EXISTS financial_transactions (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES financial_accounts(id) ON DELETE CASCADE,
    source_rail VARCHAR(50) NOT NULL, -- 'MPESA_DARAJA', 'EQUITY_JENGA', 'KCB_BUNI', 'COOP_BANK', 'STANCHART', 'PAYPAL'
    rail_reference VARCHAR(100) UNIQUE NOT NULL, -- e.g. M-Pesa Receipt 'RJL792XYZ1' or Bank Ref
    amount DECIMAL(16, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KES',
    date DATE NOT NULL,
    merchant_or_party VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    payment_channel VARCHAR(100), -- 'STK Push', 'C2B Paybill', 'Buy Goods', 'Pesalink', 'EFT', 'PayPal Remittance'
    type VARCHAR(20) DEFAULT 'debit', -- 'debit' or 'credit'
    balance_after DECIMAL(16, 2),
    etims_status VARCHAR(50) DEFAULT 'UNFISCALIZED', -- 'UNFISCALIZED', 'FISCALIZED', 'EXEMPT'
    etims_invoice_id VARCHAR(100),
    vat_amount DECIMAL(16, 2) DEFAULT 0.00,
    is_reconciled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. M-PESA DARAJA REAL-TIME CALLBACKS & AUDIT LOG
CREATE TABLE IF NOT EXISTS mpesa_callbacks (
    id SERIAL PRIMARY KEY,
    callback_type VARCHAR(50) NOT NULL, -- 'STK_PUSH_CALLBACK', 'C2B_VALIDATION', 'C2B_CONFIRMATION', 'B2C_RESULT'
    merchant_request_id VARCHAR(100),
    checkout_request_id VARCHAR(100),
    trans_id VARCHAR(100), -- M-Pesa Receipt
    phone_number VARCHAR(30),
    amount DECIMAL(16, 2),
    result_code INTEGER,
    result_desc TEXT,
    raw_payload JSONB NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. KENYAN DIRECT BANK CONNECTIONS
CREATE TABLE IF NOT EXISTS bank_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    bank_code VARCHAR(50) NOT NULL, -- 'EQUITY_KE', 'KCB_KE', 'COOP_KE', 'SCB_KE'
    account_number VARCHAR(100) NOT NULL,
    consent_id VARCHAR(100),
    api_client_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'connected', -- 'connected', 'token_expired', 'reauth_required'
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    last_pull_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. UNIFIED CHECKOUT & PAYMENT AGGREGATOR ORDERS
CREATE TABLE IF NOT EXISTS checkout_orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(100) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'mpesa_express', 'paypal', 'pesapal', 'flutterwave'
    provider_reference VARCHAR(100), -- e.g. PayPal Capture ID or Pesalink Tracking ID
    gross_amount DECIMAL(16, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'KES',
    target_currency VARCHAR(10) DEFAULT 'KES',
    settled_kes_amount DECIMAL(16, 2) NOT NULL,
    fx_rate DECIMAL(12, 6) DEFAULT 1.000000,
    fee_amount DECIMAL(16, 2) DEFAULT 0.00,
    description TEXT,
    customer_email VARCHAR(255),
    customer_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'refunded'
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. KRA eTIMS FISCAL INVOICES & TAX RECORDS
CREATE TABLE IF NOT EXISTS etims_invoices (
    id SERIAL PRIMARY KEY,
    invoice_id VARCHAR(100) UNIQUE NOT NULL,
    transaction_id INTEGER REFERENCES financial_transactions(id) ON DELETE SET NULL,
    taxpayer_kra_pin VARCHAR(20) NOT NULL,
    customer_kra_pin VARCHAR(20),
    customer_name VARCHAR(255) NOT NULL,
    cuin VARCHAR(100) UNIQUE NOT NULL, -- Control Unit Invoice Number (e.g. KRAVSCU0012345678)
    fiscal_receipt_number VARCHAR(100) NOT NULL,
    invoice_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_taxable_amount DECIMAL(16, 2) NOT NULL,
    total_tax_amount DECIMAL(16, 2) NOT NULL, -- 16% VAT or exempt
    grand_total DECIMAL(16, 2) NOT NULL,
    qr_code_url TEXT NOT NULL, -- KRA inspection URL
    vscu_status VARCHAR(50) DEFAULT 'FISCALIZED', -- 'PENDING', 'FISCALIZED', 'FAILED'
    vscu_signature TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. WEALTH, INVESTMENTS & CBK PORTFOLIO
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    asset_type VARCHAR(50) NOT NULL, -- 'Money Market Fund', 'CBK Treasury Bill', 'Infrastructure Bond', 'NSE Equities', 'Sacco'
    institution_name VARCHAR(255) NOT NULL, -- 'CIC Asset Management', 'CBK CSD', 'Sanlam', 'Stima Sacco', 'Safaricom PLC'
    holding_name VARCHAR(255) NOT NULL,
    principal_invested DECIMAL(16, 2) NOT NULL,
    current_valuation DECIMAL(16, 2) NOT NULL,
    accrued_earnings DECIMAL(16, 2) DEFAULT 0.00,
    annualized_yield_percent DECIMAL(6, 2) NOT NULL, -- e.g. 15.50%
    maturity_date DATE,
    is_tax_exempt BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. LOCAL KENYAN CATEGORIES
CREATE TABLE IF NOT EXISTS expense_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(10)
);

INSERT INTO expense_categories (name, icon, color) VALUES
('Food & Supermarkets', '🛒', '#F87171'),
('Utilities & Electricity (KPLC)', '💡', '#FBBF24'),
('Mobile Airtime & Fibre (Safaricom)', '📶', '#34D399'),
('Transportation & Fuel (Rubis/Total)', '⛽', '#60A5FA'),
('Shopping & Retail', '🛍️', '#A78BFA'),
('Healthcare & Pharmacy', '🏥', '#F472B6'),
('Rent & Housing', '🏠', '#818CF8'),
('Business Sales & Inflows', '💰', '#10B981'),
('Tax & KRA Payments', '🏛️', '#EF4444'),
('Investments & MMF Deposits', '📈', '#059669'),
('Transfers & Pesalink', '🔄', '#9CA3AF'),
('Other Expenses', '📦', '#6B7280')
ON CONFLICT (name) DO UPDATE
SET icon = EXCLUDED.icon, color = EXCLUDED.color;

-- 10. SEED DEFAULT KENYAN USER & SAMPLE ACCOUNTS
INSERT INTO users (id, email, full_name, phone_number, kra_pin, business_name, role)
VALUES (1, 'finance@kenyabiz.co.ke', 'Wanjiku Kamau', '254712345678', 'A009876543Z', 'Safari Digital Ventures', 'business')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO financial_accounts (id, user_id, institution_code, institution_name, account_number_mask, account_type, currency, available_balance, actual_balance)
VALUES
(1, 1, 'SAFARICOM', 'M-Pesa Business Till & Paybill', 'Till: 889021', 'M-Pesa Paybill / Till', 'KES', 145800.00, 145800.00),
(2, 1, 'EQUITY', 'Equity Bank Kenya (Jenga Connect)', '****4819', 'Checking / Current', 'KES', 485200.00, 485200.00),
(3, 1, 'KCB', 'KCB Bank Kenya (Buni API)', '****9102', 'Savings', 'KES', 210000.00, 210000.00),
(4, 1, 'COOP', 'Co-operative Bank of Kenya', '****3321', 'Checking / Current', 'KES', 95400.00, 95400.00),
(5, 1, 'SCB', 'Standard Chartered Kenya', '****6541', 'Checking / Current', 'KES', 320000.00, 320000.00),
(6, 1, 'PAYPAL', 'PayPal USD Remittance Wallet', 'wanjiku@paypal.com', 'PayPal Balance', 'USD', 2450.00, 2450.00),
(7, 1, 'CIC_MMF', 'CIC Money Market Fund', 'MMF-009231', 'Money Market Fund', 'KES', 850000.00, 850000.00)
ON CONFLICT (id) DO NOTHING;

-- 11. SEED WEALTH HOLDINGS
INSERT INTO portfolio_holdings (id, user_id, asset_type, institution_name, holding_name, principal_invested, current_valuation, accrued_earnings, annualized_yield_percent, maturity_date, is_tax_exempt)
VALUES
(1, 1, 'CBK Treasury Bill', 'Central Bank of Kenya (CSD)', '91-Day Treasury Bill (Issue 2580)', 500000.00, 519500.00, 19500.00, 15.65, CURRENT_DATE + INTERVAL '45 days', FALSE),
(2, 1, 'Infrastructure Bond', 'Central Bank of Kenya (CSD)', 'IFB1/2024/6.5Yr (Tax Free)', 1000000.00, 1089000.00, 89000.00, 17.75, CURRENT_DATE + INTERVAL '5 years', TRUE),
(3, 1, 'Money Market Fund', 'CIC Asset Management', 'CIC Kenya Shilling MMF', 850000.00, 878200.00, 28200.00, 13.40, NULL, FALSE),
(4, 1, 'NSE Equities', 'Nairobi Securities Exchange', 'Safaricom PLC (SCOM)', 350000.00, 395000.00, 45000.00, 6.80, NULL, FALSE)
ON CONFLICT (id) DO NOTHING;
