import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

export const DEMO_USER = {
  id: 1,
  email: 'demo@financialdashboard.ke',
  full_name: 'Demo User',
  phone_number: '+254712345678',
  country: 'KE',
};

export const DEMO_ACCOUNTS = [
  {
    name: 'Safaricom M-Pesa',
    institution: 'Safaricom',
    account_type: 'mobile_money',
    currency: 'KES',
    balance: 42850.0,
    is_asset: true,
  },
  {
    name: 'Equity Classic Current Account',
    institution: 'Equity Bank',
    account_type: 'bank_checking',
    currency: 'KES',
    balance: 185400.0,
    is_asset: true,
  },
  {
    name: 'KCB Goal Savings',
    institution: 'KCB Bank',
    account_type: 'bank_savings',
    currency: 'KES',
    balance: 95000.0,
    is_asset: true,
  },
  {
    name: 'Stima SACCO Deposit',
    institution: 'Stima SACCO',
    account_type: 'sacco',
    currency: 'KES',
    balance: 320000.0,
    is_asset: true,
  },
  {
    name: 'CIC Money Market Fund (MMF)',
    institution: 'CIC Asset Management',
    account_type: 'investment',
    currency: 'KES',
    balance: 250000.0,
    is_asset: true,
  },
];

export const DEMO_TRANSACTIONS = [
  {
    account_index: 0,
    amount: 3200,
    currency: 'KES',
    type: 'expense' as const,
    date: new Date().toISOString().split('T')[0],
    description: 'Naivas Supermarket Food Shopping',
    category: 'Food & Groceries',
    reference: 'QHL921KK89',
    import_source: 'mpesa_statement',
  },
  {
    account_index: 0,
    amount: 1500,
    currency: 'KES',
    type: 'expense' as const,
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    description: 'Kenya Power Prepaid Electricity Tokens (888880)',
    category: 'Utilities & Water (KPLC)',
    reference: 'QHL483JJ22',
    import_source: 'mpesa_statement',
  },
  {
    account_index: 1,
    amount: 165000,
    currency: 'KES',
    type: 'income' as const,
    date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    description: 'Monthly Salary Credit',
    category: 'Salary & Primary Income',
    reference: 'EQT9821049',
    import_source: 'bank_csv',
  },
  {
    account_index: 0,
    amount: 2500,
    currency: 'KES',
    type: 'expense' as const,
    date: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
    description: 'Safaricom Home Fibre 50Mbps Renewal',
    category: 'Airtime & Internet (Safaricom)',
    reference: 'QHL112OP90',
    import_source: 'mpesa_statement',
  },
  {
    account_index: 0,
    amount: 4500,
    currency: 'KES',
    type: 'expense' as const,
    date: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    description: 'Rubis Fuel Station Westlands',
    category: 'Transport & Fuel (Matatu/Petrol)',
    reference: 'QHL003MM41',
    import_source: 'manual',
  },
  {
    account_index: 1,
    amount: 45000,
    currency: 'KES',
    type: 'expense' as const,
    date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    description: 'Monthly House Rent Kilimani',
    category: 'Rent & Housing',
    reference: 'EQT8821102',
    import_source: 'bank_csv',
  },
  {
    account_index: 0,
    amount: 15000,
    currency: 'KES',
    type: 'income' as const,
    date: new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0],
    description: 'Software Development Freelance Gig',
    category: 'Side Hustle & Consulting',
    reference: 'QHK9902188',
    import_source: 'mpesa_statement',
  },
  {
    account_index: 0,
    amount: 10000,
    currency: 'KES',
    type: 'transfer' as const,
    date: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
    description: 'Transfer to CIC MMF Investment Account',
    category: 'Savings & MMF Deposit',
    reference: 'QHK3310022',
    import_source: 'manual',
  },
];

export const DEMO_ASSETS = [
  {
    name: '1/8th Acre Plot in Juja (Title Deed)',
    category: 'land',
    estimated_value: 1650000,
    currency: 'KES',
    notes: 'Freehold title deed located 2km from Thika Superhighway.',
  },
  {
    name: 'Subaru Forester 2.0 XT (2016)',
    category: 'vehicle',
    estimated_value: 1850000,
    currency: 'KES',
    notes: 'Insured comprehensively with Jubilee Insurance.',
  },
  {
    name: 'Safaricom PLC NSE Shares (10,000 shares)',
    category: 'investments',
    estimated_value: 175000,
    currency: 'KES',
    notes: 'Held through Dyer & Blair CDSC account.',
  },
  {
    name: 'Home Audio & Apple Workstation Rig',
    category: 'valuables',
    estimated_value: 380000,
    currency: 'KES',
    notes: 'MacBook Pro M2 Max and Studio Monitors.',
  },
];

export const DEMO_LIABILITIES = [
  {
    name: 'Equity Auto Asset Loan',
    creditor: 'Equity Bank',
    category: 'car_loan',
    principal_amount: 1200000,
    outstanding_balance: 640000,
    interest_rate: 13.5,
    monthly_payment: 34500,
    currency: 'KES',
    due_date: '2027-04-15',
    notes: 'Vehicle logbook held with Equity Bank.',
  },
  {
    name: 'HELB Higher Education Loan',
    creditor: 'HELB Kenya',
    category: 'helb',
    principal_amount: 280000,
    outstanding_balance: 85000,
    interest_rate: 4.0,
    monthly_payment: 5000,
    currency: 'KES',
    due_date: '2027-12-01',
    notes: 'Direct salary check-off deduction.',
  },
  {
    name: 'Stima SACCO Development Loan',
    creditor: 'Stima SACCO',
    category: 'sacco_loan',
    principal_amount: 500000,
    outstanding_balance: 220000,
    interest_rate: 12.0,
    monthly_payment: 16800,
    currency: 'KES',
    due_date: '2026-11-30',
  },
];

export const DEMO_BUDGETS = [
  { category: 'Food & Groceries', monthly_limit: 25000, currency: 'KES' },
  { category: 'Rent & Housing', monthly_limit: 50000, currency: 'KES' },
  { category: 'Utilities & Water (KPLC)', monthly_limit: 6000, currency: 'KES' },
  { category: 'Airtime & Internet (Safaricom)', monthly_limit: 5000, currency: 'KES' },
  { category: 'Transport & Fuel (Matatu/Petrol)', monthly_limit: 15000, currency: 'KES' },
  { category: 'Entertainment & Dining', monthly_limit: 10000, currency: 'KES' },
];

export const DEMO_SAVINGS_GOALS = [
  {
    name: '6-Month Emergency Safety Fund',
    target_amount: 300000,
    current_amount: 185000,
    currency: 'KES',
    target_date: '2026-12-31',
  },
  {
    name: 'Land Development & Construction Deposit',
    target_amount: 1000000,
    current_amount: 420000,
    currency: 'KES',
    target_date: '2027-08-31',
  },
  {
    name: 'December Coast Holiday Vacation',
    target_amount: 80000,
    current_amount: 60000,
    currency: 'KES',
    target_date: '2026-12-15',
  },
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required to seed demo data.');
    console.error('Example: DATABASE_URL="postgresql://user:pass@localhost:5432/finance_dashboard" npm run seed:demo');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // 0. Ensure schema exists if running for first time
    const schemaPath = path.join(process.cwd(), 'migrations', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Applying schema from migrations/schema.sql if not applied...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
    }

    // 1. Seed user
    console.log('Seeding demo user...');
    await pool.query(
      `INSERT INTO users (id, email, full_name, phone_number, country)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_USER.id, DEMO_USER.email, DEMO_USER.full_name, DEMO_USER.phone_number, DEMO_USER.country]
    );

    // 2. Seed accounts
    console.log('Seeding accounts...');
    const createdAccountIds: number[] = [];
    for (const acc of DEMO_ACCOUNTS) {
      const res = await pool.query(
        `INSERT INTO accounts (user_id, name, institution, account_type, currency, current_balance, is_asset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [DEMO_USER.id, acc.name, acc.institution, acc.account_type, acc.currency, acc.balance, acc.is_asset]
      );
      createdAccountIds.push(res.rows[0].id);
    }

    // 3. Seed transactions
    console.log('Seeding transactions...');
    for (const tx of DEMO_TRANSACTIONS) {
      const accId = createdAccountIds[tx.account_index] || createdAccountIds[0];
      await pool.query(
        `INSERT INTO transactions (user_id, account_id, amount, currency, type, date, description, category, reference, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, reference) DO NOTHING`,
        [DEMO_USER.id, accId, tx.amount, tx.currency, tx.type, tx.date, tx.description, tx.category, tx.reference, tx.import_source]
      );
    }

    // 4. Seed assets
    console.log('Seeding assets...');
    for (const asset of DEMO_ASSETS) {
      await pool.query(
        `INSERT INTO assets (user_id, name, category, estimated_value, currency, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [DEMO_USER.id, asset.name, asset.category, asset.estimated_value, asset.currency, asset.notes]
      );
    }

    // 5. Seed liabilities
    console.log('Seeding liabilities...');
    for (const liab of DEMO_LIABILITIES) {
      await pool.query(
        `INSERT INTO liabilities (user_id, name, creditor, category, principal_amount, outstanding_balance, interest_rate, monthly_payment, currency, due_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          DEMO_USER.id,
          liab.name,
          liab.creditor,
          liab.category,
          liab.principal_amount,
          liab.outstanding_balance,
          liab.interest_rate,
          liab.monthly_payment,
          liab.currency,
          liab.due_date,
          liab.notes || null,
        ]
      );
    }

    // 6. Seed budgets
    console.log('Seeding budgets...');
    for (const b of DEMO_BUDGETS) {
      await pool.query(
        `INSERT INTO budgets (user_id, category, monthly_limit, currency)
         VALUES ($1, $2, $3, $4)`,
        [DEMO_USER.id, b.category, b.monthly_limit, b.currency]
      );
    }

    // 7. Seed savings goals
    console.log('Seeding savings goals...');
    for (const g of DEMO_SAVINGS_GOALS) {
      await pool.query(
        `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, target_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [DEMO_USER.id, g.name, g.target_amount, g.current_amount, g.currency, g.target_date]
      );
    }

    console.log('Demo data successfully seeded!');
  } catch (err) {
    console.error('Failed to seed demo data:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
