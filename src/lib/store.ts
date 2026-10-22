import { query } from './db';

export interface PersonalAccount {
  id: string | number;
  name: string;
  institution: string;
  account_type: 'mobile_money' | 'bank_savings' | 'bank_checking' | 'sacco' | 'cash' | 'investment';
  currency: string;
  balance: number;
  is_asset: boolean;
  updated_at?: string;
}

export interface PersonalTransaction {
  id: string | number;
  account_id: string | number;
  account_name?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense' | 'transfer';
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  reference?: string;
  import_source: 'manual' | 'mpesa_statement' | 'bank_csv' | 'mpesa_sms';
}

export interface PersonalAsset {
  id: string | number;
  name: string;
  category: 'real_estate' | 'vehicle' | 'investments' | 'land' | 'livestock' | 'valuables' | 'other';
  estimated_value: number;
  currency: string;
  notes?: string;
  updated_at?: string;
}

export interface PersonalLiability {
  id: string | number;
  name: string;
  creditor: string;
  category: 'personal_loan' | 'mortgage' | 'car_loan' | 'helb' | 'sacco_loan' | 'mobile_loan' | 'credit_card' | 'other';
  principal_amount: number;
  outstanding_balance: number;
  interest_rate?: number;
  monthly_payment?: number;
  currency: string;
  due_date?: string;
  notes?: string;
}

export interface PersonalBudget {
  id: string | number;
  category: string;
  monthly_limit: number;
  currency: string;
}

export interface PersonalSavingsGoal {
  id: string | number;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string;
}

export const KENYAN_EXPENSE_CATEGORIES = [
  { name: 'Food & Groceries', icon: '🛒', color: '#F87171' },
  { name: 'Rent & Housing', icon: '🏠', color: '#818CF8' },
  { name: 'Utilities & Water (KPLC)', icon: '💡', color: '#FBBF24' },
  { name: 'Airtime & Internet (Safaricom)', icon: '📶', color: '#34D399' },
  { name: 'Transport & Fuel (Matatu/Petrol)', icon: '⛽', color: '#60A5FA' },
  { name: 'Family & Chamas', icon: '🤝', color: '#F472B6' },
  { name: 'Shopping & Essentials', icon: '🛍️', color: '#A78BFA' },
  { name: 'Healthcare & Pharmacy', icon: '🏥', color: '#FB7185' },
  { name: 'Education & School Fees', icon: '📚', color: '#38BDF8' },
  { name: 'Entertainment & Dining', icon: '🎬', color: '#E879F9' },
  { name: 'Salary & Primary Income', icon: '💰', color: '#10B981' },
  { name: 'Side Hustle & Consulting', icon: '💼', color: '#059669' },
  { name: 'Transfers & Remittance', icon: '🔄', color: '#9CA3AF' },
  { name: 'Savings & MMF Deposit', icon: '📈', color: '#6366F1' },
  { name: 'Loan & Fuliza Repayment', icon: '🏛️', color: '#EF4444' },
  { name: 'Other', icon: '📦', color: '#6B7280' },
];

// Clean Initial Starter Fixtures for Personal Wealth
let accountsStore: PersonalAccount[] = [
  {
    id: 1,
    name: 'Safaricom M-Pesa',
    institution: 'Safaricom',
    account_type: 'mobile_money',
    currency: 'KES',
    balance: 42850.0,
    is_asset: true,
  },
  {
    id: 2,
    name: 'Equity Classic Current Account',
    institution: 'Equity Bank',
    account_type: 'bank_checking',
    currency: 'KES',
    balance: 185400.0,
    is_asset: true,
  },
  {
    id: 3,
    name: 'KCB Goal Savings',
    institution: 'KCB Bank',
    account_type: 'bank_savings',
    currency: 'KES',
    balance: 95000.0,
    is_asset: true,
  },
  {
    id: 4,
    name: 'Stima SACCO Deposit',
    institution: 'Stima SACCO',
    account_type: 'sacco',
    currency: 'KES',
    balance: 320000.0,
    is_asset: true,
  },
  {
    id: 5,
    name: 'CIC Money Market Fund (MMF)',
    institution: 'CIC Asset Management',
    account_type: 'investment',
    currency: 'KES',
    balance: 250000.0,
    is_asset: true,
  },
];

let transactionsStore: PersonalTransaction[] = [
  {
    id: 1,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 3200,
    currency: 'KES',
    type: 'expense',
    date: new Date().toISOString().split('T')[0],
    description: 'Naivas Supermarket Food Shopping',
    category: 'Food & Groceries',
    reference: 'QHL921KK89',
    import_source: 'mpesa_statement',
  },
  {
    id: 2,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 1500,
    currency: 'KES',
    type: 'expense',
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    description: 'Kenya Power Prepaid Electricity Tokens (888880)',
    category: 'Utilities & Water (KPLC)',
    reference: 'QHL483JJ22',
    import_source: 'mpesa_statement',
  },
  {
    id: 3,
    account_id: 2,
    account_name: 'Equity Classic Current Account',
    amount: 165000,
    currency: 'KES',
    type: 'income',
    date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    description: 'Monthly Salary Credit',
    category: 'Salary & Primary Income',
    reference: 'EQT9821049',
    import_source: 'bank_csv',
  },
  {
    id: 4,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 2500,
    currency: 'KES',
    type: 'expense',
    date: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
    description: 'Safaricom Home Fibre 50Mbps Renewal',
    category: 'Airtime & Internet (Safaricom)',
    reference: 'QHL112OP90',
    import_source: 'mpesa_statement',
  },
  {
    id: 5,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 4500,
    currency: 'KES',
    type: 'expense',
    date: new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0],
    description: 'Rubis Fuel Station Westlands',
    category: 'Transport & Fuel (Matatu/Petrol)',
    reference: 'QHL003MM41',
    import_source: 'manual',
  },
  {
    id: 6,
    account_id: 2,
    account_name: 'Equity Classic Current Account',
    amount: 45000,
    currency: 'KES',
    type: 'expense',
    date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
    description: 'Monthly House Rent Kilimani',
    category: 'Rent & Housing',
    reference: 'EQT8821102',
    import_source: 'bank_csv',
  },
  {
    id: 7,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 15000,
    currency: 'KES',
    type: 'income',
    date: new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0],
    description: 'Software Development Freelance Gig',
    category: 'Side Hustle & Consulting',
    reference: 'QHK9902188',
    import_source: 'mpesa_statement',
  },
  {
    id: 8,
    account_id: 1,
    account_name: 'Safaricom M-Pesa',
    amount: 10000,
    currency: 'KES',
    type: 'transfer',
    date: new Date(Date.now() - 15 * 86400000).toISOString().split('T')[0],
    description: 'Transfer to CIC MMF Investment Account',
    category: 'Savings & MMF Deposit',
    reference: 'QHK3310022',
    import_source: 'manual',
  },
];

let assetsStore: PersonalAsset[] = [
  {
    id: 1,
    name: '1/8th Acre Plot in Juja (Title Deed)',
    category: 'land',
    estimated_value: 1650000,
    currency: 'KES',
    notes: 'Freehold title deed located 2km from Thika Superhighway.',
  },
  {
    id: 2,
    name: 'Subaru Forester 2.0 XT (2016)',
    category: 'vehicle',
    estimated_value: 1850000,
    currency: 'KES',
    notes: 'Insured comprehensively with Jubilee Insurance.',
  },
  {
    id: 3,
    name: 'Safaricom PLC NSE Shares (10,000 shares)',
    category: 'investments',
    estimated_value: 175000,
    currency: 'KES',
    notes: 'Held through Dyer & Blair CDSC account.',
  },
  {
    id: 4,
    name: 'Home Audio & Apple Workstation Rig',
    category: 'valuables',
    estimated_value: 380000,
    currency: 'KES',
    notes: 'MacBook Pro M2 Max and Studio Monitors.',
  },
];

let liabilitiesStore: PersonalLiability[] = [
  {
    id: 1,
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
    id: 2,
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
    id: 3,
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

let budgetsStore: PersonalBudget[] = [
  { id: 1, category: 'Food & Groceries', monthly_limit: 25000, currency: 'KES' },
  { id: 2, category: 'Rent & Housing', monthly_limit: 50000, currency: 'KES' },
  { id: 3, category: 'Utilities & Water (KPLC)', monthly_limit: 6000, currency: 'KES' },
  { id: 4, category: 'Airtime & Internet (Safaricom)', monthly_limit: 5000, currency: 'KES' },
  { id: 5, category: 'Transport & Fuel (Matatu/Petrol)', monthly_limit: 15000, currency: 'KES' },
  { id: 6, category: 'Entertainment & Dining', monthly_limit: 10000, currency: 'KES' },
];

let savingsGoalsStore: PersonalSavingsGoal[] = [
  {
    id: 1,
    name: '6-Month Emergency Safety Fund',
    target_amount: 300000,
    current_amount: 185000,
    currency: 'KES',
    target_date: '2026-12-31',
  },
  {
    id: 2,
    name: 'Land Development & Construction Deposit',
    target_amount: 1000000,
    current_amount: 420000,
    currency: 'KES',
    target_date: '2027-08-31',
  },
  {
    id: 3,
    name: 'December Coast Holiday Vacation',
    target_amount: 80000,
    current_amount: 60000,
    currency: 'KES',
    target_date: '2026-12-15',
  },
];

// Helper to check if DB is configured and accessible
export async function isDbConnected(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const res = await query('SELECT 1');
    return !!res;
  } catch {
    return false;
  }
}

// ----------------- ACCOUNTS -----------------
export async function getAccounts(): Promise<PersonalAccount[]> {
  if (process.env.DATABASE_URL) {
    try {
      const res = await query('SELECT * FROM accounts WHERE is_active = TRUE ORDER BY id ASC');
      if (res && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          institution: r.institution || '',
          account_type: r.account_type,
          currency: r.currency || 'KES',
          balance: parseFloat(r.current_balance || '0'),
          is_asset: r.is_asset ?? true,
          updated_at: r.updated_at,
        }));
      }
    } catch (e) {
      console.warn('DB query failed for accounts, using memory store:', e);
    }
  }
  return [...accountsStore];
}

export async function addAccount(account: Omit<PersonalAccount, 'id'>): Promise<PersonalAccount> {
  if (process.env.DATABASE_URL) {
    try {
      const res = await query(
        `INSERT INTO accounts (user_id, name, institution, account_type, currency, current_balance, is_asset)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [1, account.name, account.institution, account.account_type, account.currency || 'KES', account.balance, account.is_asset]
      );
      const r = res.rows[0];
      return {
        id: r.id,
        name: r.name,
        institution: r.institution,
        account_type: r.account_type,
        currency: r.currency,
        balance: parseFloat(r.current_balance),
        is_asset: r.is_asset,
      };
    } catch (e) {
      console.warn('DB insert failed for account, fallback to memory:', e);
    }
  }

  const newAcc: PersonalAccount = {
    ...account,
    id: Date.now(),
  };
  accountsStore.push(newAcc);
  return newAcc;
}

// ----------------- TRANSACTIONS -----------------
export async function getTransactions(filters?: {
  limit?: number;
  category?: string;
  search?: string;
  accountId?: string | number;
}): Promise<PersonalTransaction[]> {
  let list = [...transactionsStore];

  if (filters?.category && filters.category !== 'All') {
    list = list.filter((t) => t.category.toLowerCase() === filters.category!.toLowerCase());
  }
  if (filters?.accountId && filters.accountId !== 'All') {
    list = list.filter((t) => String(t.account_id) === String(filters.accountId));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.reference && t.reference.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return list.slice(0, filters?.limit || 100);
}

export async function addTransaction(tx: Omit<PersonalTransaction, 'id'>): Promise<PersonalTransaction> {
  const newTx: PersonalTransaction = {
    ...tx,
    id: Date.now() + Math.floor(Math.random() * 1000),
  };
  transactionsStore.unshift(newTx);

  // Update account balance accordingly
  const targetAcc = accountsStore.find((a) => String(a.id) === String(tx.account_id));
  if (targetAcc) {
    if (tx.type === 'income') {
      targetAcc.balance += Number(tx.amount);
    } else if (tx.type === 'expense') {
      targetAcc.balance -= Number(tx.amount);
    }
  }

  return newTx;
}

// ----------------- ASSETS & LIABILITIES -----------------
export async function getAssets(): Promise<PersonalAsset[]> {
  return [...assetsStore];
}

export async function addAsset(asset: Omit<PersonalAsset, 'id'>): Promise<PersonalAsset> {
  const newAsset: PersonalAsset = { ...asset, id: Date.now() };
  assetsStore.push(newAsset);
  return newAsset;
}

export async function getLiabilities(): Promise<PersonalLiability[]> {
  return [...liabilitiesStore];
}

export async function addLiability(liability: Omit<PersonalLiability, 'id'>): Promise<PersonalLiability> {
  const newLiab: PersonalLiability = { ...liability, id: Date.now() };
  liabilitiesStore.push(newLiab);
  return newLiab;
}

// ----------------- BUDGETS & GOALS -----------------
export async function getBudgets(): Promise<PersonalBudget[]> {
  return [...budgetsStore];
}

export async function getSavingsGoals(): Promise<PersonalSavingsGoal[]> {
  return [...savingsGoalsStore];
}

export async function addSavingsGoal(goal: Omit<PersonalSavingsGoal, 'id'>): Promise<PersonalSavingsGoal> {
  const newGoal: PersonalSavingsGoal = { ...goal, id: Date.now() };
  savingsGoalsStore.push(newGoal);
  return newGoal;
}

export async function updateSavingsGoal(id: string | number, amountToAdd: number): Promise<PersonalSavingsGoal | null> {
  const g = savingsGoalsStore.find((item) => String(item.id) === String(id));
  if (g) {
    g.current_amount += amountToAdd;
    return g;
  }
  return null;
}

// ----------------- NET WORTH SUMMARY -----------------
export async function getNetWorthMetrics() {
  const accounts = await getAccounts();
  const assets = await getAssets();
  const liabilities = await getLiabilities();

  const liquidCash = accounts
    .filter((a) => a.is_asset)
    .reduce((sum, a) => sum + (a.currency === 'USD' ? a.balance * 130 : a.balance), 0);

  const physicalAssets = assets.reduce((sum, a) => sum + a.estimated_value, 0);
  const totalAssets = liquidCash + physicalAssets;
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.outstanding_balance, 0);
  const netWorth = totalAssets - totalLiabilities;
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  // Monthly Cash Flow
  const transactions = await getTransactions({ limit: 500 });
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthTxs = transactions.filter((t) => t.date.startsWith(currentMonth));
  const monthlyIncome = monthTxs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const monthlyExpenses = monthTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netSavings = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (netSavings / monthlyIncome) * 100 : 0;

  return {
    netWorth,
    totalAssets,
    liquidCash,
    physicalAssets,
    totalLiabilities,
    debtToAssetRatio,
    monthlyIncome,
    monthlyExpenses,
    netSavings,
    savingsRate,
  };
}

// ----------------- EXPENSES BY CATEGORY -----------------
export async function getExpensesByCategory() {
  const txs = await getTransactions({ limit: 500 });
  const expenseTxs = txs.filter((t) => t.type === 'expense');

  const catMap = new Map<string, { total: number; count: number }>();
  for (const t of expenseTxs) {
    const existing = catMap.get(t.category) || { total: 0, count: 0 };
    existing.total += t.amount;
    existing.count += 1;
    catMap.set(t.category, existing);
  }

  const results = [];
  for (const [category, val] of catMap.entries()) {
    const matched = KENYAN_EXPENSE_CATEGORIES.find((c) => c.name.toLowerCase() === category.toLowerCase());
    results.push({
      category,
      icon: matched?.icon || '📦',
      color: matched?.color || '#94A3B8',
      total_amount: val.total,
      transaction_count: val.count,
    });
  }

  return results.sort((a, b) => b.total_amount - a.total_amount);
}

export interface ParsedImportRow {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  reference?: string;
  category: string;
}

export function parseMpesaStatementText(rawText: string): ParsedImportRow[] {
  const lines = rawText.split('\n');
  const results: ParsedImportRow[] = [];

  // M-Pesa SMS Regex patterns
  // Pattern 1: Receipt Confirmed. KshX,XXX.XX sent to NAME on DATE at TIME...
  // Pattern 2: Receipt Confirmed. You have received KshX,XXX.XX from NAME on DATE...
  // Pattern 3: CSV row: ReceiptNo, CompletionTime, Details, TransactionStatus, PaidIn, Withdrawn, Balance
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line is CSV
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map((p) => p.replace(/"/g, '').trim());
      if (parts.length >= 6 && parts[0] !== 'Receipt No.' && parts[0].length >= 8) {
        const ref = parts[0];
        const dateRaw = parts[1] || new Date().toISOString().split('T')[0];
        const details = parts[2] || 'M-Pesa Transaction';
        const paidIn = parseFloat(parts[4] || '0');
        const withdrawn = parseFloat(parts[5] || '0');

        let amount = 0;
        let type: 'income' | 'expense' = 'expense';
        if (paidIn > 0) {
          amount = paidIn;
          type = 'income';
        } else if (withdrawn > 0) {
          amount = withdrawn;
          type = 'expense';
        }

        if (amount > 0) {
          results.push({
            reference: ref,
            date: dateRaw.slice(0, 10),
            description: details,
            amount,
            type,
            category: categorizeKenyanDescription(details),
          });
          continue;
        }
      }
    }

    // Try parsing SMS text
    const smsSentMatch = trimmed.match(/([A-Z0-9]{10})\s+Confirmed\.\s+Ksh([0-9,.]+)\s+sent\s+to\s+([^on]+)\s+on\s+([0-9/]+)/i);
    if (smsSentMatch) {
      results.push({
        reference: smsSentMatch[1],
        amount: parseFloat(smsSentMatch[2].replace(/,/g, '')),
        description: `Sent to ${smsSentMatch[3].trim()}`,
        type: 'expense',
        date: formatDateKenyan(smsSentMatch[4]),
        category: categorizeKenyanDescription(smsSentMatch[3]),
      });
      continue;
    }

    const smsReceivedMatch = trimmed.match(/([A-Z0-9]{10})\s+Confirmed\.\s+You\s+have\s+received\s+Ksh([0-9,.]+)\s+from\s+([^on]+)\s+on\s+([0-9/]+)/i);
    if (smsReceivedMatch) {
      results.push({
        reference: smsReceivedMatch[1],
        amount: parseFloat(smsReceivedMatch[2].replace(/,/g, '')),
        description: `Received from ${smsReceivedMatch[3].trim()}`,
        type: 'income',
        date: formatDateKenyan(smsReceivedMatch[4]),
        category: 'Salary & Primary Income',
      });
      continue;
    }

    const paybillMatch = trimmed.match(/([A-Z0-9]{10})\s+Confirmed\.\s+Ksh([0-9,.]+)\s+paid\s+to\s+([^.]+)\./i);
    if (paybillMatch) {
      results.push({
        reference: paybillMatch[1],
        amount: parseFloat(paybillMatch[2].replace(/,/g, '')),
        description: `Paid to ${paybillMatch[3].trim()}`,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        category: categorizeKenyanDescription(paybillMatch[3]),
      });
      continue;
    }
  }

  return results;
}

function formatDateKenyan(raw: string): string {
  try {
    const parts = raw.split('/');
    if (parts.length === 3) {
      // DD/MM/YY or DD/MM/YYYY
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
  } catch {}
  return new Date().toISOString().split('T')[0];
}

function categorizeKenyanDescription(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('kplc') || d.includes('power') || d.includes('water') || d.includes('tokens')) return 'Utilities & Water (KPLC)';
  if (d.includes('safaricom') || d.includes('airtime') || d.includes('fibre') || d.includes('bundles') || d.includes('zuku')) return 'Airtime & Internet (Safaricom)';
  if (d.includes('naivas') || d.includes('quickmart') || d.includes('carrefour') || d.includes('groceries') || d.includes('food')) return 'Food & Groceries';
  if (d.includes('total') || d.includes('rubis') || d.includes('shell') || d.includes('matatu') || d.includes('uber') || d.includes('bolt') || d.includes('petrol')) return 'Transport & Fuel (Matatu/Petrol)';
  if (d.includes('rent') || d.includes('landlord') || d.includes('housing')) return 'Rent & Housing';
  if (d.includes('hospital') || d.includes('pharmacy') || d.includes('chemist') || d.includes('doctor')) return 'Healthcare & Pharmacy';
  if (d.includes('school') || d.includes('fees') || d.includes('university') || d.includes('college')) return 'Education & School Fees';
  if (d.includes('salary') || d.includes('payroll') || d.includes('wages')) return 'Salary & Primary Income';
  if (d.includes('mmf') || d.includes('cic') || d.includes('sanlam') || d.includes('shares') || d.includes('cdsc')) return 'Savings & MMF Deposit';
  if (d.includes('fuliza') || d.includes('m-shwari loan') || d.includes('kcb mpesa') || d.includes('loan')) return 'Loan & Fuliza Repayment';
  return 'Shopping & Essentials';
}
