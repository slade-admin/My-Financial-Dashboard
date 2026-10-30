import { getAccounts } from './accounts';
import { getAssets } from './assets';
import { getLiabilities } from './liabilities';
import { getTransactions } from './transactions';
import { KENYAN_EXPENSE_CATEGORIES } from './categories';
import { NetWorthMetrics, ExpenseByCategory, toMoney } from './types';

export async function getNetWorthMetrics(userId: number): Promise<NetWorthMetrics> {
  const [accounts, assets, liabilities, transactions] = await Promise.all([
    getAccounts(userId),
    getAssets(userId),
    getLiabilities(userId),
    getTransactions(userId, { limit: 500 }),
  ]);

  const liquidCash = toMoney(
    accounts
      .filter((a) => a.is_asset)
      .reduce(
        (sum, a) =>
          sum + (a.currency === 'USD' ? toMoney(a.balance * 130) : a.balance),
        0
      )
  );

  const physicalAssets = toMoney(
    assets.reduce((sum, a) => sum + a.estimated_value, 0)
  );

  const totalAssets = toMoney(liquidCash + physicalAssets);

  const totalLiabilities = toMoney(
    liabilities.reduce((sum, l) => sum + l.outstanding_balance, 0)
  );

  const netWorth = toMoney(totalAssets - totalLiabilities);

  const debtToAssetRatio =
    totalAssets > 0
      ? toMoney((totalLiabilities / totalAssets) * 100)
      : 0;

  // Monthly Cash Flow in Africa/Nairobi time
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthTxs = transactions.filter((t) => t.date.startsWith(currentMonth));

  const monthlyIncome = toMoney(
    monthTxs
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const monthlyExpenses = toMoney(
    monthTxs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const netSavings = toMoney(monthlyIncome - monthlyExpenses);

  const savingsRate =
    monthlyIncome > 0
      ? toMoney((netSavings / monthlyIncome) * 100)
      : 0;

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

export async function getExpensesByCategory(
  userId: number
): Promise<ExpenseByCategory[]> {
  const txs = await getTransactions(userId, { limit: 500 });
  const expenseTxs = txs.filter((t) => t.type === 'expense');

  const catMap = new Map<string, { total: number; count: number }>();
  for (const t of expenseTxs) {
    const existing = catMap.get(t.category) || { total: 0, count: 0 };
    existing.total = toMoney(existing.total + t.amount);
    existing.count += 1;
    catMap.set(t.category, existing);
  }

  const results: ExpenseByCategory[] = [];
  for (const [category, val] of catMap.entries()) {
    const matched = KENYAN_EXPENSE_CATEGORIES.find(
      (c) => c.name.toLowerCase() === category.toLowerCase()
    );
    results.push({
      category,
      icon: matched?.icon || '📦',
      color: matched?.color || '#94A3B8',
      total_amount: toMoney(val.total),
      transaction_count: val.count,
    });
  }

  return results.sort((a, b) => b.total_amount - a.total_amount);
}
