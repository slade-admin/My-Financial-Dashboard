import { query } from '../db';
import { PersonalAccount, toMoney, DbRow} from './types';
import { accountId, moneyInput, requireKES } from '../money';
import { BadRequestError } from '../errors';
import { normalizeAccountIdentifier } from '../account-identifiers';
import { choiceInput, textInput } from '../validation';
import { auditedTransaction, editRecord, insertRecord } from './history';

type AccountDetails = Pick<PersonalAccount, 'name' | 'institution' | 'account_type' | 'account_identifier' | 'is_asset'>;

function accountDetails(account: AccountDetails) {
  const identifier = textInput(account.account_identifier, 'Account identifier', 40, true);
  const normalized = identifier ? normalizeAccountIdentifier(identifier) : undefined;
  if (identifier && !normalized) throw new BadRequestError('Account identifier must contain at least four visible trailing digits.');
  if (account.is_asset !== undefined && typeof account.is_asset !== 'boolean') throw new BadRequestError('Asset inclusion must be true or false.');
  return {
    name: textInput(account.name, 'Account name', 255),
    institution: textInput(account.institution, 'Institution', 255, true),
    account_type: choiceInput(account.account_type,
      ['mobile_money', 'bank_savings', 'bank_checking', 'sacco', 'cash', 'investment'], 'account type'),
    account_identifier: normalized || null,
    is_asset: account.is_asset ?? true,
  };
}

export async function getAccounts(userId: number): Promise<PersonalAccount[]> {
  const res = await query(
    'SELECT * FROM accounts WHERE user_id = $1 AND is_active = TRUE ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapAccountRow);
}

export async function getAccountById(
  userId: number,
  id: string | number
): Promise<PersonalAccount | null> {
  const res = await query(
    'SELECT * FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = TRUE',
    [userId, accountId(id)]
  );
  if (res.rows.length === 0) return null;
  return mapAccountRow(res.rows[0]);
}

export async function addAccount(
  userId: number,
  account: Omit<PersonalAccount, 'id'> & { request_id?: string }
): Promise<PersonalAccount> {
  const balance = moneyInput(account.balance, 'Opening balance', { allowZero: true, allowNegative: true });
  const details = accountDetails(account);
  const values = { ...details, currency: requireKES(account.currency), current_balance: balance, opening_balance: balance, is_active: true };
  return auditedTransaction('Account created', async (client) =>
    mapAccountRow((await insertRecord(client, userId, 'accounts', values, account.request_id)).row));
}

export async function updateAccount(
  userId: number, id: string | number, details: AccountDetails, version: unknown, reason: string,
): Promise<PersonalAccount> {
  const row = await editRecord(userId, 'accounts', id, version, accountDetails(details), reason);
  return mapAccountRow(row);
}

export async function updateAccountIdentifier(userId: number, id: string | number, value: string, version?: number): Promise<PersonalAccount> {
  const existing = await getAccountById(userId, id);
  if (!existing) throw new BadRequestError('Account not found for user.');
  return updateAccount(userId, id, { ...existing, account_identifier: value }, version ?? existing.version, 'Bank SMS identifier changed');
}

function mapAccountRow(r: DbRow): PersonalAccount {
  return {
    id: r.id,
    version: r.version,
    name: r.name,
    institution: r.institution || '',
    account_type: r.account_type,
    currency: r.currency || 'KES',
    balance: toMoney(r.current_balance),
    opening_balance: toMoney(r.opening_balance),
    account_identifier: r.account_identifier || undefined,
    is_asset: r.is_asset ?? true,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}
