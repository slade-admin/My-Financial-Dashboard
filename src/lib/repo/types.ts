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

export interface AddTransactionResult {
  transaction: PersonalTransaction;
  isDuplicate: boolean;
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

export interface Category {
  id?: number;
  name: string;
  icon: string;
  color: string;
}

export interface NetWorthMetrics {
  netWorth: number;
  totalAssets: number;
  liquidCash: number;
  physicalAssets: number;
  totalLiabilities: number;
  debtToAssetRatio: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netSavings: number;
  savingsRate: number;
}

export interface ExpenseByCategory {
  category: string;
  icon: string;
  color: string;
  total_amount: number;
  transaction_count: number;
}

export interface TransactionFilters {
  limit?: number;
  category?: string;
  search?: string;
  accountId?: string | number;
}

/**
 * Rounds to 2 decimal places to guarantee clean monetary math in JS.
 */
export function toMoney(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Normalise a DATE column to 'YYYY-MM-DD'.
 *
 * db.ts registers a type parser so DATE arrives as a string already, which is
 * the fast path here. The Date branch stays as a safety net and deliberately
 * reads LOCAL components rather than calling toISOString(): node-pg builds the
 * Date at local midnight, so converting it to a UTC instant shifts the
 * calendar date back a day in any timezone ahead of UTC (EAT included).
 */
export function toDateString(
  val: string | Date | null | undefined,
): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

/** Today's calendar date in local time as 'YYYY-MM-DD'. */
export function todayLocal(now: Date = new Date()): string {
  return toDateString(now)!;
}

/**
 * A raw result row from pg.
 *
 * Rows are dynamically typed: the driver returns whatever the query selected,
 * and column types are not known to TypeScript. Declaring this once, with the
 * single suppression it needs, is honest about that and replaces the `r: any`
 * that was repeated across every mapper. The fuller fix is a hand-written
 * interface per table, which is a larger change than this one is worth today.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = Record<string, any>;
