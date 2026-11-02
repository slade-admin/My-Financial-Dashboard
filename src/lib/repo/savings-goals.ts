import { query } from '../db';
import { PersonalSavingsGoal, toMoney, toDateString, DbRow} from './types';

export async function getSavingsGoals(userId: number): Promise<PersonalSavingsGoal[]> {
  const res = await query(
    'SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapGoalRow);
}

export async function addSavingsGoal(
  userId: number,
  goal: Omit<PersonalSavingsGoal, 'id'>
): Promise<PersonalSavingsGoal> {
  const res = await query(
    `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, currency, target_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      goal.name,
      toMoney(goal.target_amount),
      toMoney(goal.current_amount || 0),
      goal.currency || 'KES',
      goal.target_date || null,
    ]
  );
  return mapGoalRow(res.rows[0]);
}

export async function updateSavingsGoal(
  userId: number,
  id: string | number,
  amountToAdd: number
): Promise<PersonalSavingsGoal | null> {
  const res = await query(
    `UPDATE savings_goals
     SET current_amount = current_amount + $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [toMoney(amountToAdd), id, userId]
  );

  if (res.rows.length === 0) return null;
  return mapGoalRow(res.rows[0]);
}

function mapGoalRow(r: DbRow): PersonalSavingsGoal {
  const targetDateStr = toDateString(r.target_date);

  return {
    id: r.id,
    name: r.name,
    target_amount: toMoney(r.target_amount),
    current_amount: toMoney(r.current_amount),
    currency: r.currency || 'KES',
    target_date: targetDateStr || undefined,
  };
}
