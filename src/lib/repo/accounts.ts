import { query } from '../db';
import { PersonalAccount, toMoney } from './types';

export async function getAccounts(userId: number): Promise<PersonalAccount[]> {
  const res = await query(
    'SELECT * FROM accounts WHERE user_id = $1 AND is_active = TRUE ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapAccountRow);
}

export async function getAccountById(
  userId: number,
  accountId: string | number
): Promise<PersonalAccount | null> {
  const res = await query(
    'SELECT * FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = TRUE',
    [userId, accountId]
  );
  if (res.rows.length === 0) return null;
  return mapAccountRow(res.rows[0]);
}

export async function addAccount(
  userId: number,
  account: Omit<PersonalAccount, 'id'>
): Promise<PersonalAccount> {
  const res = await query(
    `INSERT INTO accounts (user_id, name, institution, account_type, currency, current_balance, is_asset, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     RETURNING *`,
    [
      userId,
      account.name,
      account.institution || '',
      account.account_type,
      account.currency || 'KES',
      toMoney(account.balance),
      account.is_asset ?? true,
    ]
  );
  return mapAccountRow(res.rows[0]);
}

function mapAccountRow(r: any): PersonalAccount {
  return {
    id: r.id,
    name: r.name,
    institution: r.institution || '',
    account_type: r.account_type,
    currency: r.currency || 'KES',
    balance: toMoney(r.current_balance),
    is_asset: r.is_asset ?? true,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}
