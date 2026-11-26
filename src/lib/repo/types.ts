export interface PersonalAccount {
  id: string | number;
  version?: number;
  name: string;
  institution: string;
  account_type: 'mobile_money' | 'bank_savings' | 'bank_checking' | 'sacco' | 'cash' | 'investment';
  currency: string;
  balance: number;
  opening_balance?: number;
  account_identifier?: string;
  is_asset: boolean;
  updated_at?: string;
}

export interface PersonalTransaction {
  id: string | number;
  version?: number;
  account_id: string | number;
  voided_at?: string;
  account_name?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  transfer_account_id?: string | number;
  transfer_account_name?: string;
  fee_amount?: number;
  fee_account_id?: string | number;
  parent_transaction_id?: string | number;
  import_batch_id?: string;
  source_fingerprint?: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  reference?: string;
  import_source: 'manual' | 'mpesa_statement' | 'bank_csv' | 'mpesa_sms' | 'bank_sms';
}

export interface AddTransactionResult {
  transaction: PersonalTransaction;
  isDuplicate: boolean;
}

export interface PersonalAsset {
  id: string | number;
  version?: number;
  name: string;
  category: 'real_estate' | 'vehicle' | 'investments' | 'land' | 'livestock' | 'valuables' | 'other';
  estimated_value: number;
  currency: string;
  notes?: string;
  updated_at?: string;
}

export interface PersonalLiability {
  id: string | number;
  version?: number;
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
  version?: number;
  category: string;
  monthly_limit: number;
  currency: string;
  month?: string;
  actual_spending?: number;
  remaining?: number;
  overspent?: boolean;
}

export interface PersonalSavingsGoal {
  id: string | number;
  version?: number;
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
  offset?: number;
  category?: string;
  search?: string;
  accountId?: string | number;
  transactionType?: PersonalTransaction['type'];
  startDate?: string;
  endDate?: string;
  needsReview?: boolean;
  status?: 'active' | 'reversed' | 'all';
}

export interface TransactionPage {
  transactions: PersonalTransaction[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  needsReviewCount: number;
}

export interface GoalContribution {
  id: number;
  amount: number;
  date: string;
  note: string;
  created_at: string;
}

export interface HistoryEntry {
  id: string;
  action: 'create' | 'update' | 'reverse';
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  created_at: string;
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

/** Nairobi calendar date, independent of the server or browser timezone. */
export function todayLocal(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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
