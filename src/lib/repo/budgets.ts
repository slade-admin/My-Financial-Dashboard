import { query } from '../db';
import { PersonalBudget, toMoney, DbRow} from './types';

export async function getBudgets(userId: number): Promise<PersonalBudget[]> {
  const res = await query(
    'SELECT * FROM budgets WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapBudgetRow);
}

export async function addBudget(
  userId: number,
  budget: Omit<PersonalBudget, 'id'>
): Promise<PersonalBudget> {
  const res = await query(
    `INSERT INTO budgets (user_id, category, monthly_limit, currency)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, budget.category, toMoney(budget.monthly_limit), budget.currency || 'KES']
  );
  return mapBudgetRow(res.rows[0]);
}

function mapBudgetRow(r: DbRow): PersonalBudget {
  return {
    id: r.id,
    category: r.category,
    monthly_limit: toMoney(r.monthly_limit),
    currency: r.currency || 'KES',
  };
}
