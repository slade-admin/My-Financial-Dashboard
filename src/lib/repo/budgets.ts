import { query } from '../db';
import { PersonalBudget, toMoney, todayLocal, DbRow } from './types';
import { accountId, ledgerDate, moneyInput, requireKES } from '../money';
import { BadRequestError, ConflictError } from '../errors';
import { categoryInput } from '../validation';
import { auditedTransaction, checkVersion } from './history';

export async function getBudgets(userId: number, month = todayLocal().slice(0, 7)): Promise<PersonalBudget[]> {
  const start = ledgerDate(`${month}-01`);
  const res = await query(`
    SELECT b.*,COALESCE(SUM(t.amount),0) AS actual_spending,
      COALESCE(BOOL_OR(t.currency IS DISTINCT FROM 'KES') FILTER (WHERE t.id IS NOT NULL),FALSE) AS foreign_currency
    FROM budgets b LEFT JOIN transactions t
      ON t.user_id=b.user_id AND LOWER(t.category)=LOWER(b.category) AND t.type='expense'
      AND t.voided_at IS NULL AND t.date >= $2::date AND t.date < $2::date + INTERVAL '1 month'
    WHERE b.user_id=$1 AND b.is_active GROUP BY b.id ORDER BY b.id
  `, [userId, start]);
  return res.rows.map((row) => {
    if (row.foreign_currency) requireKES('unsupported');
    const budget = mapBudgetRow(row);
    const actual = toMoney(row.actual_spending);
    return { ...budget, month, actual_spending: actual, remaining: toMoney(budget.monthly_limit - actual),
      overspent: actual > budget.monthly_limit };
  });
}

export async function addBudget(
  userId: number,
  budget: Omit<PersonalBudget, 'id'>
): Promise<PersonalBudget> {
  return saveBudget(userId, budget, 'Monthly budget created');
}

export async function updateBudget(
  userId: number, id: string | number, budget: Omit<PersonalBudget, 'id'>, version: unknown, reason: string,
) {
  return saveBudget(userId, budget, reason, { id, version });
}

async function saveBudget(
  userId: number, budget: Omit<PersonalBudget, 'id'>, reason: string, editing?: { id: string | number; version: unknown },
): Promise<PersonalBudget> {
  const category = categoryInput(budget.category);
  const limit = moneyInput(budget.monthly_limit, 'Budget limit', { allowZero: true });
  requireKES(budget.currency);
  return auditedTransaction(reason, async (client) => {
    // Serialize category uniqueness without rewriting or merging legacy duplicate budgets.
    await client.query('SELECT pg_advisory_xact_lock($1, 4)', [userId]);
    if (editing) {
      const current = await client.query('SELECT * FROM budgets WHERE id=$1 AND user_id=$2 AND is_active FOR UPDATE',
        [accountId(editing.id), userId]);
      if (!current.rowCount) throw new BadRequestError('Budget not found for user.');
      checkVersion(current.rows[0], editing.version);
    }
    const duplicate = await client.query(
      'SELECT 1 FROM budgets WHERE user_id=$1 AND is_active AND LOWER(category)=LOWER($2) AND id<>$3 LIMIT 1',
      [userId, category, editing?.id ?? 0],
    );
    if (duplicate.rowCount) throw new ConflictError('An active budget already exists for this category. Edit it instead, or retire a legacy duplicate.');
    const result = editing
      ? await client.query('UPDATE budgets SET category=$1,monthly_limit=$2 WHERE id=$3 AND user_id=$4 RETURNING *',
        [category, limit, editing.id, userId])
      : await client.query('INSERT INTO budgets (user_id,category,monthly_limit,currency) VALUES ($1,$2,$3,$4) RETURNING *',
        [userId, category, limit, 'KES']);
    return mapBudgetRow(result.rows[0]);
  });
}

export async function retireBudget(userId: number, id: string | number, version: unknown, reason: string) {
  return auditedTransaction(reason, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1, 4)', [userId]);
    const result = await client.query('SELECT * FROM budgets WHERE id=$1 AND user_id=$2 AND is_active FOR UPDATE',
      [accountId(id), userId]);
    if (!result.rowCount) throw new BadRequestError('Budget not found for user.');
    checkVersion(result.rows[0], version);
    await client.query('UPDATE budgets SET is_active=FALSE WHERE id=$1 AND user_id=$2', [id, userId]);
  });
}

function mapBudgetRow(r: DbRow): PersonalBudget {
  return {
    id: r.id,
    version: r.version,
    category: r.category,
    monthly_limit: toMoney(r.monthly_limit),
    currency: requireKES(r.currency || 'KES'),
  };
}
