/**
 * scripts/seed-demo.ts  —  npm run seed:demo [-- --email=you@example.com]
 *
 * By default this seeds a standalone demo user that has no password_hash and
 * therefore cannot be logged into. Since Phase 2 added real authentication
 * that data is invisible in the UI: you sign in as yourself and see an empty
 * dashboard while the demo rows sit under a login-less row.
 *
 * Pass --email (or --user-id) to attach the demo data to an account you can
 * actually sign in as:
 *
 *   npm run seed:demo -- --email=you@example.com
 *
 * Re-running is safe. Every insert is keyed on something natural (account
 * name, budget category, transaction reference), so a second run tops up what
 * is missing instead of duplicating. Nothing is ever deleted, so pointing this
 * at a real account cannot destroy real data.
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { loadLocalEnv, maskUrl } from './load-env';

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

/** Read --flag=value / --flag value from argv. */
function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  return undefined;
}

/**
 * Decide which user the demo data belongs to.
 *  --user-id=N  use that id, must already exist
 *  --email=X    use that account, must already exist (so a typo cannot
 *               silently create a second login-less user)
 *  neither      the built-in demo user, created if absent
 */
async function resolveTargetUser(pool: Pool): Promise<{ id: number; label: string }> {
  const wantId = arg('user-id');
  const wantEmail = arg('email');

  if (wantId && wantEmail) {
    throw new Error('Pass either --user-id or --email, not both.');
  }

  if (wantId) {
    const n = Number(wantId);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`--user-id must be a positive integer, got "${wantId}"`);
    const r = await pool.query<{ id: number; email: string }>('SELECT id, email FROM users WHERE id = $1', [n]);
    if (r.rows.length === 0) throw new Error(`No user with id ${n}. Sign up in the app first.`);
    return { id: r.rows[0].id, label: `${r.rows[0].email} (id ${r.rows[0].id})` };
  }

  if (wantEmail) {
    const r = await pool.query<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE email = $1',
      [wantEmail.toLowerCase().trim()],
    );
    if (r.rows.length === 0) {
      throw new Error(
        `No user with email "${wantEmail}". Sign up at /signup first, then re-run.`,
      );
    }
    return { id: r.rows[0].id, label: `${r.rows[0].email} (id ${r.rows[0].id})` };
  }

  await pool.query(
    `INSERT INTO users (id, email, full_name, phone_number, country)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [DEMO_USER.id, DEMO_USER.email, DEMO_USER.full_name, DEMO_USER.phone_number, DEMO_USER.country],
  );
  return { id: DEMO_USER.id, label: `${DEMO_USER.email} (id ${DEMO_USER.id}, cannot log in)` };
}

/**
 * Insert only if no row for this user already matches on `keyCol`.
 * Used instead of ON CONFLICT because these tables have no unique constraint
 * on their natural key, and adding one would be a schema change that could
 * fail against existing duplicate rows.
 */
async function insertIfAbsent(
  pool: Pool,
  table: string,
  userId: number,
  keyCol: string,
  keyVal: string,
  cols: string[],
  vals: unknown[],
): Promise<boolean> {
  const existing = await pool.query(
    `SELECT 1 FROM ${table} WHERE user_id = $1 AND ${keyCol} = $2 LIMIT 1`,
    [userId, keyVal],
  );
  if ((existing.rowCount ?? 0) > 0) return false;

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await pool.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
  return true;
}

async function seed() {
  // .env.local is not read automatically by tsx the way `next dev` reads it.
  const loaded = loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is required to seed demo data.');
    console.error('Set it in .env.local, or pass it inline:');
    console.error('  DATABASE_URL="postgresql://user:pass@host:5432/db" npm run seed:demo');
    process.exit(1);
  }
  if (loaded.length) console.log(`Loaded env from ${loaded.join(', ')}`);
  console.log(`Connecting to ${maskUrl(databaseUrl)}`);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // 0. Ensure schema exists if running for first time
    const schemaPath = path.join(process.cwd(), 'migrations', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('Applying schema from migrations/schema.sql if not applied...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
    }

    // 1. Resolve which user owns this data
    const target = await resolveTargetUser(pool);
    console.log(`Seeding demo data for ${target.label}`);
    const uid = target.id;
    const added = { accounts: 0, transactions: 0, assets: 0, liabilities: 0, budgets: 0, goals: 0 };

    // 2. Accounts (keyed on name)
    console.log('Seeding accounts...');
    const accountIds: number[] = [];
    for (const acc of DEMO_ACCOUNTS) {
      const found = await pool.query<{ id: number }>(
        'SELECT id FROM accounts WHERE user_id = $1 AND name = $2 LIMIT 1',
        [uid, acc.name],
      );
      if (found.rows.length > 0) {
        accountIds.push(found.rows[0].id);
        continue;
      }
      const res = await pool.query<{ id: number }>(
        `INSERT INTO accounts (user_id, name, institution, account_type, currency, current_balance, is_asset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [uid, acc.name, acc.institution, acc.account_type, acc.currency, acc.balance, acc.is_asset],
      );
      accountIds.push(res.rows[0].id);
      added.accounts++;
    }

    // 3. Transactions (keyed on reference by the UNIQUE (user_id, reference) constraint)
    console.log('Seeding transactions...');
    for (const tx of DEMO_TRANSACTIONS) {
      const accId = accountIds[tx.account_index] ?? accountIds[0];
      const r = await pool.query(
        `INSERT INTO transactions (user_id, account_id, amount, currency, type, date, description, category, reference, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, reference) DO NOTHING`,
        [uid, accId, tx.amount, tx.currency, tx.type, tx.date, tx.description, tx.category, tx.reference, tx.import_source],
      );
      added.transactions += r.rowCount ?? 0;
    }

    // 4. Assets (keyed on name)
    console.log('Seeding assets...');
    for (const a of DEMO_ASSETS) {
      if (await insertIfAbsent(pool, 'assets', uid, 'name', a.name,
        ['user_id', 'name', 'category', 'estimated_value', 'currency', 'notes'],
        [uid, a.name, a.category, a.estimated_value, a.currency, a.notes])) added.assets++;
    }

    // 5. Liabilities (keyed on name)
    console.log('Seeding liabilities...');
    for (const l of DEMO_LIABILITIES) {
      if (await insertIfAbsent(pool, 'liabilities', uid, 'name', l.name,
        ['user_id', 'name', 'creditor', 'category', 'principal_amount', 'outstanding_balance', 'interest_rate', 'monthly_payment', 'currency', 'due_date', 'notes'],
        [uid, l.name, l.creditor, l.category, l.principal_amount, l.outstanding_balance, l.interest_rate, l.monthly_payment, l.currency, l.due_date, l.notes || null])) added.liabilities++;
    }

    // 6. Budgets (keyed on category)
    console.log('Seeding budgets...');
    for (const b of DEMO_BUDGETS) {
      if (await insertIfAbsent(pool, 'budgets', uid, 'category', b.category,
        ['user_id', 'category', 'monthly_limit', 'currency'],
        [uid, b.category, b.monthly_limit, b.currency])) added.budgets++;
    }

    // 7. Savings goals (keyed on name)
    console.log('Seeding savings goals...');
    for (const g of DEMO_SAVINGS_GOALS) {
      if (await insertIfAbsent(pool, 'savings_goals', uid, 'name', g.name,
        ['user_id', 'name', 'target_amount', 'current_amount', 'currency', 'target_date'],
        [uid, g.name, g.target_amount, g.current_amount, g.currency, g.target_date])) added.goals++;
    }

    console.log(
      `
Inserted: ${added.accounts} accounts, ${added.transactions} transactions, ` +
      `${added.assets} assets, ${added.liabilities} liabilities, ${added.budgets} budgets, ` +
      `${added.goals} savings goals. (0 means it already existed - re-running is a no-op.)`,
    );
    console.log('Demo data successfully seeded!');
  } catch (err) {
    // Operator mistakes (unknown --email, bad --user-id) get a plain message;
    // a stack trace there is noise that buries the instruction to fix it.
    // Anything unexpected still prints in full so it can be debugged.
    const expected = err instanceof Error && /^(No user |--user-id |Pass either )/.test(err.message);
    if (expected) {
      console.error(`\nERROR: ${(err as Error).message}`);
    } else {
      console.error('Failed to seed demo data:', err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
