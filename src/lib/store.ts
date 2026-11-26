import { query } from './db';
import { currentUserId } from './session';
import * as repo from './repo';

export * from './repo/types';
export { KENYAN_EXPENSE_CATEGORIES } from './repo/categories';

// Helper to check if DB is configured and accessible. Throws on error.
export async function isDbConnected(): Promise<boolean> {
  const res = await query('SELECT 1');
  return !!res;
}

// ----------------- ACCOUNTS -----------------
export async function getAccounts(): Promise<repo.PersonalAccount[]> {
  return repo.getAccounts(await currentUserId());
}

export async function addAccount(
  account: Parameters<typeof repo.addAccount>[1]
): Promise<repo.PersonalAccount> {
  return repo.addAccount(await currentUserId(), account);
}

export async function reconcileAccount(id: string | number, actualBalance: unknown, date: string, reason: string, version?: unknown) {
  return repo.reconcileAccount(await currentUserId(), id, actualBalance, date, reason, version);
}

export async function updateAccountIdentifier(id: string | number, identifier: string, version?: number) {
  return repo.updateAccountIdentifier(await currentUserId(), id, identifier, version);
}

export async function updateAccount(id: string | number, account: Parameters<typeof repo.updateAccount>[2], version: unknown, reason: string) {
  return repo.updateAccount(await currentUserId(), id, account, version, reason);
}

// ----------------- TRANSACTIONS -----------------
export async function getTransactions(
  filters?: repo.TransactionFilters
): Promise<repo.PersonalTransaction[]> {
  return repo.getTransactions(await currentUserId(), filters);
}

export async function getTransactionPage(filters?: repo.TransactionFilters) {
  return repo.getTransactionPage(await currentUserId(), filters);
}

export async function updateTransaction(id: string | number, changes: Partial<repo.PersonalTransaction>, version: unknown, reason: string) {
  return repo.updateTransaction(await currentUserId(), id, changes, version, reason);
}

export async function reverseTransaction(id: string | number, version: unknown, reason: string) {
  return repo.reverseTransaction(await currentUserId(), id, version, reason);
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

export async function updateTransactionCategory(
  transactionId: string | number,
  category: string,
  version?: number,
): Promise<repo.PersonalTransaction | null> {
  return repo.updateTransactionCategory(await currentUserId(), transactionId, category, version);
}

// ----------------- ASSETS & LIABILITIES -----------------
export async function getAssets(): Promise<repo.PersonalAsset[]> {
  return repo.getAssets(await currentUserId());
}

export async function addAsset(
  asset: Parameters<typeof repo.addAsset>[1]
): Promise<repo.PersonalAsset> {
  return repo.addAsset(await currentUserId(), asset);
}

export async function getLiabilities(): Promise<repo.PersonalLiability[]> {
  return repo.getLiabilities(await currentUserId());
}

export async function updateAsset(id: string | number, asset: Omit<repo.PersonalAsset, 'id'>, version: unknown, reason: string) {
  return repo.updateAsset(await currentUserId(), id, asset, version, reason);
}

export async function updateLiability(id: string | number, liability: Omit<repo.PersonalLiability, 'id'>, version: unknown, reason: string) {
  return repo.updateLiability(await currentUserId(), id, liability, version, reason);
}

export async function addLiability(
  liability: Parameters<typeof repo.addLiability>[1]
): Promise<repo.PersonalLiability> {
  return repo.addLiability(await currentUserId(), liability);
}

// ----------------- BUDGETS & GOALS -----------------
export async function getBudgets(month?: string): Promise<repo.PersonalBudget[]> {
  return repo.getBudgets(await currentUserId(), month);
}

export async function addBudget(budget: Omit<repo.PersonalBudget, 'id'>) {
  return repo.addBudget(await currentUserId(), budget);
}

export async function updateBudget(id: string | number, budget: Omit<repo.PersonalBudget, 'id'>, version: unknown, reason: string) {
  return repo.updateBudget(await currentUserId(), id, budget, version, reason);
}

export async function retireBudget(id: string | number, version: unknown, reason: string) {
  return repo.retireBudget(await currentUserId(), id, version, reason);
}

export async function getSavingsGoals(): Promise<repo.PersonalSavingsGoal[]> {
  return repo.getSavingsGoals(await currentUserId());
}

export async function addSavingsGoal(
  goal: Parameters<typeof repo.addSavingsGoal>[1]
): Promise<repo.PersonalSavingsGoal> {
  return repo.addSavingsGoal(await currentUserId(), goal);
}

export async function updateSavingsGoal(
  id: string | number,
  amountToAdd: number
): Promise<repo.PersonalSavingsGoal | null> {
  return repo.updateSavingsGoal(await currentUserId(), id, amountToAdd);
}

export async function editSavingsGoal(id: string | number, goal: Parameters<typeof repo.editSavingsGoal>[2], version: unknown, reason: string) {
  return repo.editSavingsGoal(await currentUserId(), id, goal, version, reason);
}

export async function contributeToGoal(id: string | number, input: Parameters<typeof repo.contributeToGoal>[2]) {
  return repo.contributeToGoal(await currentUserId(), id, input);
}

export async function getGoalContributions(id: string | number, page?: number) {
  return repo.getGoalContributions(await currentUserId(), id, page);
}

export async function getCategories() {
  return repo.getCategories(await currentUserId());
}

export async function getRecordHistory(entity: string, id: string | number, page?: number) {
  return repo.getRecordHistory(await currentUserId(), entity, id, page);
}

// ----------------- NET WORTH & CASH FLOW -----------------
export async function getNetWorthMetrics(): Promise<repo.NetWorthMetrics> {
  return repo.getNetWorthMetrics(await currentUserId());
}

export async function getExpensesByCategory(): Promise<repo.ExpenseByCategory[]> {
  return repo.getExpensesByCategory(await currentUserId());
}
