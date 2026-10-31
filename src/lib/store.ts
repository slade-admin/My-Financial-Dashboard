import { query } from './db';
import { currentUserId } from './session';
import * as repo from './repo';
import { parseMpesaBlob } from './mpesa';

export * from './repo/types';
export { KENYAN_EXPENSE_CATEGORIES } from './repo/categories';

// Helper to check if DB is configured and accessible. Throws on error.
export async function isDbConnected(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  const res = await query('SELECT 1');
  return !!res;
}

// ----------------- ACCOUNTS -----------------
export async function getAccounts(): Promise<repo.PersonalAccount[]> {
  return repo.getAccounts(await currentUserId());
}

export async function addAccount(
  account: Omit<repo.PersonalAccount, 'id'>
): Promise<repo.PersonalAccount> {
  return repo.addAccount(await currentUserId(), account);
}

// ----------------- TRANSACTIONS -----------------
export async function getTransactions(
  filters?: repo.TransactionFilters
): Promise<repo.PersonalTransaction[]> {
  return repo.getTransactions(await currentUserId(), filters);
}

export async function addTransaction(
  tx: Omit<repo.PersonalTransaction, 'id'>
): Promise<repo.PersonalTransaction> {
  const result = await repo.addTransaction(await currentUserId(), tx);
  return result.transaction;
}

export async function addTransactionWithStatus(
  tx: Omit<repo.PersonalTransaction, 'id'>
): Promise<repo.AddTransactionResult> {
  return repo.addTransaction(await currentUserId(), tx);
}

// ----------------- ASSETS & LIABILITIES -----------------
export async function getAssets(): Promise<repo.PersonalAsset[]> {
  return repo.getAssets(await currentUserId());
}

export async function addAsset(
  asset: Omit<repo.PersonalAsset, 'id'>
): Promise<repo.PersonalAsset> {
  return repo.addAsset(await currentUserId(), asset);
}

export async function getLiabilities(): Promise<repo.PersonalLiability[]> {
  return repo.getLiabilities(await currentUserId());
}

export async function addLiability(
  liability: Omit<repo.PersonalLiability, 'id'>
): Promise<repo.PersonalLiability> {
  return repo.addLiability(await currentUserId(), liability);
}

// ----------------- BUDGETS & GOALS -----------------
export async function getBudgets(): Promise<repo.PersonalBudget[]> {
  return repo.getBudgets(await currentUserId());
}

export async function getSavingsGoals(): Promise<repo.PersonalSavingsGoal[]> {
  return repo.getSavingsGoals(await currentUserId());
}

export async function addSavingsGoal(
  goal: Omit<repo.PersonalSavingsGoal, 'id'>
): Promise<repo.PersonalSavingsGoal> {
  return repo.addSavingsGoal(await currentUserId(), goal);
}

export async function updateSavingsGoal(
  id: string | number,
  amountToAdd: number
): Promise<repo.PersonalSavingsGoal | null> {
  return repo.updateSavingsGoal(await currentUserId(), id, amountToAdd);
}

// ----------------- NET WORTH & CASH FLOW -----------------
export async function getNetWorthMetrics(): Promise<repo.NetWorthMetrics> {
  return repo.getNetWorthMetrics(await currentUserId());
}

export async function getExpensesByCategory(): Promise<repo.ExpenseByCategory[]> {
  return repo.getExpensesByCategory(await currentUserId());
}

// ----------------- M-PESA & STATEMENT PARSING -----------------
export interface ParsedImportRow {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  reference?: string;
  category: string;
}

/**
 * Delegates to the parser in lib/mpesa.ts. The implementation that used to
 * live here matched counterparties with `([^on]+)`, which is "any run of
 * characters that are not o or n" — not the word "on" — so it failed on most
 * Kenyan names and had no patterns for withdrawals, airtime, Fuliza or
 * M-Shwari. See lib/mpesa.ts for the replacement.
 */
export function parseMpesaStatementText(rawText: string): ParsedImportRow[] {
  return parseMpesaBlob(rawText).map((m) => ({
    date: m.date,
    description: m.description,
    amount: m.amount,
    type: m.type,
    reference: m.reference,
    category: m.category,
  }));
}
