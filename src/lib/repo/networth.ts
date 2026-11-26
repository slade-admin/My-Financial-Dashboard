import { query } from '../db';
import { requireKES } from '../money';
import { KENYAN_EXPENSE_CATEGORIES } from './categories';
import { NetWorthMetrics, ExpenseByCategory, toMoney, todayLocal } from './types';

export async function getNetWorthMetrics(userId: number): Promise<NetWorthMetrics> {
  const monthStart = `${todayLocal().slice(0, 7)}-01`;
  const result = await query(`
    SELECT
      (SELECT COALESCE(SUM(current_balance),0) FROM accounts WHERE user_id=$1 AND is_active AND is_asset) AS cash,
      (SELECT COALESCE(SUM(estimated_value),0) FROM assets WHERE user_id=$1) AS physical,
      (SELECT COALESCE(SUM(outstanding_balance),0) FROM liabilities WHERE user_id=$1) AS debt,
      (SELECT COALESCE(SUM(amount) FILTER (WHERE type='income'),0) FROM transactions
        WHERE user_id=$1 AND voided_at IS NULL AND date >= $2::date AND date < $2::date + INTERVAL '1 month') AS income,
      (SELECT COALESCE(SUM(amount) FILTER (WHERE type='expense'),0) FROM transactions
        WHERE user_id=$1 AND voided_at IS NULL AND date >= $2::date AND date < $2::date + INTERVAL '1 month') AS expenses,
      EXISTS (
        SELECT 1 FROM accounts WHERE user_id=$1 AND currency IS DISTINCT FROM 'KES'
        UNION ALL SELECT 1 FROM assets WHERE user_id=$1 AND currency IS DISTINCT FROM 'KES'
        UNION ALL SELECT 1 FROM liabilities WHERE user_id=$1 AND currency IS DISTINCT FROM 'KES'
        UNION ALL SELECT 1 FROM transactions WHERE user_id=$1 AND voided_at IS NULL AND currency IS DISTINCT FROM 'KES'
      ) AS foreign_currency
  `, [userId, monthStart]);
  const row = result.rows[0];
  if (row.foreign_currency) requireKES('unsupported');
  const liquidCash = toMoney(row.cash);
  const physicalAssets = toMoney(row.physical);
  const totalAssets = toMoney(liquidCash + physicalAssets);
  const totalLiabilities = toMoney(row.debt);
  const monthlyIncome = toMoney(row.income);
  const monthlyExpenses = toMoney(row.expenses);
  const netSavings = toMoney(monthlyIncome - monthlyExpenses);
  return {
    liquidCash, physicalAssets, totalAssets, totalLiabilities,
    netWorth: toMoney(totalAssets - totalLiabilities),
    debtToAssetRatio: totalAssets > 0 ? toMoney(totalLiabilities / totalAssets * 100) : 0,
    monthlyIncome, monthlyExpenses, netSavings,
    savingsRate: monthlyIncome > 0 ? toMoney(netSavings / monthlyIncome * 100) : 0,
  };
}

export async function getExpensesByCategory(userId: number): Promise<ExpenseByCategory[]> {
  const result = await query(`
    SELECT category, currency, SUM(amount) AS total_amount, COUNT(*)::int AS transaction_count
    FROM transactions WHERE user_id=$1 AND type='expense' AND voided_at IS NULL
      AND date >= $2::date AND date < $2::date + INTERVAL '1 month'
    GROUP BY category, currency ORDER BY SUM(amount) DESC
  `, [userId, `${todayLocal().slice(0, 7)}-01`]);
  return result.rows.map((row) => {
    requireKES(row.currency);
    const category = KENYAN_EXPENSE_CATEGORIES.find((c) => c.name.toLowerCase() === row.category.toLowerCase());
    return {
      category: row.category, icon: category?.icon || '📦', color: category?.color || '#94A3B8',
      total_amount: toMoney(row.total_amount), transaction_count: row.transaction_count,
    };
  });
}
