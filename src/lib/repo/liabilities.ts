import { query } from '../db';
import { PersonalLiability, toMoney, toDateString, DbRow} from './types';

export async function getLiabilities(userId: number): Promise<PersonalLiability[]> {
  const res = await query(
    'SELECT * FROM liabilities WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapLiabilityRow);
}

export async function addLiability(
  userId: number,
  liability: Omit<PersonalLiability, 'id'>
): Promise<PersonalLiability> {
  const res = await query(
    `INSERT INTO liabilities (user_id, name, creditor, category, principal_amount, outstanding_balance, interest_rate, monthly_payment, currency, due_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      liability.name,
      liability.creditor || '',
      liability.category,
      toMoney(liability.principal_amount),
      toMoney(liability.outstanding_balance),
      liability.interest_rate !== undefined ? toMoney(liability.interest_rate) : null,
      liability.monthly_payment !== undefined ? toMoney(liability.monthly_payment) : null,
      liability.currency || 'KES',
      liability.due_date || null,
      liability.notes || null,
    ]
  );
  return mapLiabilityRow(res.rows[0]);
}

function mapLiabilityRow(r: DbRow): PersonalLiability {
  const dueDateStr = toDateString(r.due_date);

  return {
    id: r.id,
    name: r.name,
    creditor: r.creditor || '',
    category: r.category,
    principal_amount: toMoney(r.principal_amount),
    outstanding_balance: toMoney(r.outstanding_balance),
    interest_rate: r.interest_rate !== null ? toMoney(r.interest_rate) : undefined,
    monthly_payment: r.monthly_payment !== null ? toMoney(r.monthly_payment) : undefined,
    currency: r.currency || 'KES',
    due_date: dueDateStr || undefined,
    notes: r.notes || undefined,
  };
}
