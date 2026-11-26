import { getPool, query } from '../db';
import type { PoolClient } from 'pg';
import { BadRequestError, ConflictError } from '../errors';
import { accountId, ledgerDate, moneyInput, requireKES } from '../money';
import { ledgerEffects } from '../ledger';
import { categoryInput, choiceInput, textInput, versionInput } from '../validation';
import { auditedTransaction, checkVersion } from './history';
import {
  PersonalTransaction, TransactionFilters, TransactionPage, AddTransactionResult,
  toMoney, toDateString, DbRow,
} from './types';

function transactionWhere(userId: number, filters?: TransactionFilters) {
  const conditions = ['t.user_id = $1'];
  const params: unknown[] = [userId];
  const status = choiceInput(filters?.status ?? 'active', ['active', 'reversed', 'all'], 'transaction status');
  if (status !== 'all') conditions.push(`t.voided_at IS ${status === 'reversed' ? 'NOT ' : ''}NULL`);
  if (filters?.needsReview || filters?.category === 'Needs review') {
    conditions.push("t.type='transfer' AND LOWER(t.category)='other'");
  } else if (filters?.category && filters.category !== 'All') {
    params.push(categoryInput(filters.category));
    conditions.push(`LOWER(t.category) = LOWER($${params.length})`);
  }
  if (filters?.accountId && filters.accountId !== 'All') {
    params.push(accountId(filters.accountId));
    conditions.push(`(t.account_id = $${params.length} OR t.transfer_account_id = $${params.length})`);
  }
  if (filters?.search) {
    const search = textInput(filters.search, 'Search', 200).toLowerCase().replace(/[\\%_]/g, '\\$&');
    params.push(`%${search}%`);
    conditions.push(`(LOWER(t.description) LIKE $${params.length} OR LOWER(t.category) LIKE $${params.length}
      OR LOWER(COALESCE(t.reference, '')) LIKE $${params.length})`);
  }
  if (filters?.transactionType) {
    params.push(choiceInput(filters.transactionType, ['income', 'expense', 'transfer', 'adjustment'], 'transaction type'));
    conditions.push(`t.type=$${params.length}`);
  }
  if (filters?.startDate) {
    params.push(ledgerDate(filters.startDate));
    conditions.push(`t.date >= $${params.length}::date`);
  }
  if (filters?.endDate) {
    params.push(ledgerDate(filters.endDate));
    conditions.push(`t.date <= $${params.length}::date`);
  }
  if (filters?.startDate && filters?.endDate && filters.startDate > filters.endDate) {
    throw new BadRequestError('Start date must not be after end date.');
  }
  return { conditions, params };
}

function pagination(filters?: TransactionFilters, maxLimit = 10000) {
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) throw new BadRequestError(`Limit must be between 1 and ${maxLimit}.`);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestError('Offset must be a non-negative integer.');
  return { limit, offset };
}

export async function getTransactions(userId: number, filters?: TransactionFilters): Promise<PersonalTransaction[]> {
  const { conditions, params } = transactionWhere(userId, filters);
  const { limit, offset } = pagination(filters);
  params.push(limit, offset);
  const result = await query(`
    SELECT t.*, a.name AS account_name, d.name AS transfer_account_name
    FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts d ON t.transfer_account_id = d.id
    WHERE ${conditions.join(' AND ')} ORDER BY t.date DESC, t.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params);
  return result.rows.map(mapTransactionRow);
}

export async function getTransactionPage(userId: number, filters?: TransactionFilters): Promise<TransactionPage> {
  const { conditions, params } = transactionWhere(userId, filters);
  const { limit, offset } = pagination(filters, 200);
  params.push(limit, offset);
  const result = await query(`
    WITH filtered AS (
      SELECT t.*,a.name AS account_name,d.name AS transfer_account_name
      FROM transactions t LEFT JOIN accounts a ON t.account_id=a.id
      LEFT JOIN accounts d ON t.transfer_account_id=d.id WHERE ${conditions.join(' AND ')}
    ), page AS (
      SELECT * FROM filtered ORDER BY date DESC,id DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    )
    SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
      (SELECT COALESCE(jsonb_agg(page ORDER BY date DESC,id DESC),'[]'::jsonb) FROM page) AS transactions,
      (SELECT COUNT(*)::int FROM transactions WHERE user_id=$1 AND voided_at IS NULL
        AND type='transfer' AND LOWER(category)='other') AS needs_review_count
  `, params);
  const row = result.rows[0];
  return { transactions: row.transactions.map(mapTransactionRow), total: row.total, limit, offset,
    hasMore: offset + limit < row.total, needsReviewCount: row.needs_review_count };
}

export function normalizeTransaction(tx: Omit<PersonalTransaction, 'id'>): Omit<PersonalTransaction, 'id'> {
  const sourceId = accountId(tx.account_id);
  const amount = moneyInput(tx.amount, 'Amount');
  const fee = moneyInput(tx.fee_amount ?? 0, 'Fee', { allowZero: true });
  requireKES(tx.currency);
  ledgerDate(tx.date);
  if (!['income', 'expense', 'transfer'].includes(tx.type) || tx.parent_transaction_id !== undefined) {
    throw new BadRequestError('Use reconciliation for balance adjustments.');
  }
  const destinationId = tx.transfer_account_id === undefined || tx.transfer_account_id === null || tx.transfer_account_id === ''
    ? null : accountId(tx.transfer_account_id);
  if ((tx.type === 'transfer' && (!destinationId || destinationId === sourceId)) ||
      (tx.type !== 'transfer' && destinationId)) {
    throw new BadRequestError('Transfers require a different destination account.');
  }
  const feeAccountId = fee ? accountId(tx.fee_account_id ?? sourceId) : null;
  if (feeAccountId && feeAccountId !== sourceId && feeAccountId !== destinationId) {
    throw new BadRequestError('The fee must be charged to one of the transaction accounts.');
  }
  const description = textInput(tx.description, 'Description', 500);
  const category = categoryInput(tx.category);
  if (tx.reference !== undefined && (typeof tx.reference !== 'string' || tx.reference.length > 100)) {
    throw new BadRequestError('Reference must be text of at most 100 characters.');
  }
  if (tx.source_fingerprint && !/^[a-f0-9]{64}$/.test(tx.source_fingerprint)) throw new BadRequestError('Invalid source fingerprint.');
  return {
    account_id: sourceId, amount, currency: 'KES', type: tx.type, date: tx.date,
    description, category, reference: tx.reference?.trim() || undefined,
    import_source: choiceInput(tx.import_source === undefined ? 'manual' : tx.import_source,
      ['manual', 'mpesa_statement', 'bank_csv', 'mpesa_sms', 'bank_sms'], 'import source'),
    transfer_account_id: destinationId ?? undefined,
    fee_amount: fee, fee_account_id: feeAccountId ?? undefined,
    source_fingerprint: tx.source_fingerprint,
  };
}

export function transactionsMatch(existing: DbRow, tx: Omit<PersonalTransaction, 'id'>): boolean {
  return Number(existing.account_id) === Number(tx.account_id) && toMoney(existing.amount) === tx.amount &&
    existing.type === tx.type && toDateString(existing.date) === tx.date &&
    (existing.transfer_account_id ? Number(existing.transfer_account_id) : null) === (tx.transfer_account_id ? Number(tx.transfer_account_id) : null) &&
    toMoney(existing.fee_amount) === (tx.fee_amount ?? 0) &&
    (existing.fee_account_id ? Number(existing.fee_account_id) : null) === (tx.fee_account_id ? Number(tx.fee_account_id) : null);
}

// The caller owns BEGIN/COMMIT and, for batches, locks the complete account set first.
export async function addTransactionInTransaction(
  client: PoolClient, userId: number, input: Omit<PersonalTransaction, 'id'>,
  context: { batchId?: string; lockedAccounts?: DbRow[]; deferBalances?: boolean } = {},
): Promise<AddTransactionResult> {
  const tx = normalizeTransaction(input);
  const ids = [...new Set([Number(tx.account_id), ...(tx.transfer_account_id ? [Number(tx.transfer_account_id)] : [])])].sort((a, b) => a - b);
  const accounts = context.lockedAccounts
    ? context.lockedAccounts.filter((a) => ids.includes(a.id))
    : (await client.query(
      'SELECT id, name, currency FROM accounts WHERE user_id = $1 AND id = ANY($2::int[]) AND is_active ORDER BY id FOR UPDATE',
      [userId, ids],
    )).rows;
  if (accounts.length !== ids.length) throw new BadRequestError('Account not found for user.');
  accounts.forEach((a) => requireKES(a.currency));
  const inserted = await client.query(`
    INSERT INTO transactions
      (user_id, account_id, amount, currency, type, date, description, category, reference,
       import_source, transfer_account_id, fee_amount, fee_account_id, import_batch_id, source_fingerprint)
    VALUES ($1,$2,$3,'KES',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (user_id, reference) WHERE voided_at IS NULL DO NOTHING RETURNING *
  `, [userId, tx.account_id, tx.amount, tx.type, tx.date, tx.description, tx.category,
    tx.reference || null, tx.import_source, tx.transfer_account_id ?? null, tx.fee_amount,
    tx.fee_account_id ?? null, context.batchId ?? null, tx.source_fingerprint ?? null]);
  if (!inserted.rowCount) {
    const existing = (await client.query(
      'SELECT * FROM transactions WHERE user_id = $1 AND reference = $2 AND voided_at IS NULL',
      [userId, tx.reference],
    )).rows[0];
    if (!existing || !transactionsMatch(existing, tx)) {
      throw new ConflictError('This receipt belongs to a different transaction. Review it before importing.');
    }
    if (tx.import_source === 'bank_sms' && tx.source_fingerprint &&
        existing.source_fingerprint !== tx.source_fingerprint) {
      throw new ConflictError('The bank receipt has different or unknown source details. Review whether this is a distinct event.');
    }
    return { transaction: mapTransactionRow(existing), isDuplicate: true };
  }
  const row = inserted.rows[0];
  if (tx.fee_amount) {
    await client.query(`
      INSERT INTO transactions
        (user_id, account_id, amount, currency, type, date, description, category, import_source, parent_transaction_id, import_batch_id)
      VALUES ($1,$2,$3,'KES','expense',$4,'Transaction fee','Transaction Fees',$5,$6,$7)
    `, [userId, tx.fee_account_id, tx.fee_amount, tx.date, tx.import_source, row.id, context.batchId ?? null]);
  }
  if (!context.deferBalances) {
    for (const [id, delta] of ledgerEffects(tx, true)) {
      await client.query(
        'UPDATE accounts SET current_balance = current_balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3',
        [delta, id, userId],
      );
    }
  }
  row.account_name = accounts.find((a) => a.id === tx.account_id)?.name;
  row.transfer_account_name = accounts.find((a) => a.id === tx.transfer_account_id)?.name;
  return { transaction: mapTransactionRow(row), isDuplicate: false };
}

export async function addTransaction(
  userId: number, tx: Omit<PersonalTransaction, 'id'>,
): Promise<AddTransactionResult> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await addTransactionInTransaction(client, userId, tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reconcileAccount(
  userId: number, id: string | number, actualBalance: unknown, date: string, reason: string, version?: unknown,
): Promise<PersonalTransaction | null> {
  const target = accountId(id);
  const expectedVersion = version === undefined ? undefined : versionInput(version);
  const actual = moneyInput(actualBalance, 'Statement balance', { allowZero: true, allowNegative: true });
  ledgerDate(date);
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    throw new BadRequestError('A reconciliation reason of 1 to 500 characters is required.');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.change_reason', $1, true)", [reason.trim()]);
    const account = (await client.query(
      'SELECT current_balance, currency, version FROM accounts WHERE id = $1 AND user_id = $2 AND is_active FOR UPDATE',
      [target, userId],
    )).rows[0];
    if (!account) throw new BadRequestError('Account not found for user.');
    requireKES(account.currency);
    const later = await client.query(`
      SELECT 1 FROM transactions WHERE user_id = $1
        AND voided_at IS NULL AND (account_id = $2 OR transfer_account_id = $2) AND date > $3::date LIMIT 1
    `, [userId, target, date]);
    if (later.rowCount) throw new BadRequestError('Use a statement date on or after the latest recorded movement in this account.');
    const difference = moneyInput(toMoney(actual - toMoney(account.current_balance)), 'Adjustment',
      { allowZero: true, allowNegative: true });
    if (!difference) {
      await client.query('COMMIT');
      return null;
    }
    if (expectedVersion !== undefined) checkVersion(account, expectedVersion);
    const result = await client.query(`
      INSERT INTO transactions (user_id, account_id, amount, currency, type, date, description, category, import_source)
      VALUES ($1,$2,$3,'KES','adjustment',$4,$5,'Balance Reconciliation','manual') RETURNING *
    `, [userId, target, difference, date, reason.trim()]);
    await client.query('UPDATE accounts SET current_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [actual, target]);
    await client.query('COMMIT');
    return mapTransactionRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTransactionCategory(
  userId: number, transactionId: string | number, category: string, version?: number,
): Promise<PersonalTransaction | null> {
  const result = await query('SELECT version FROM transactions WHERE id=$1 AND user_id=$2 AND voided_at IS NULL',
    [accountId(transactionId), userId]);
  if (!result.rowCount) return null;
  return changeTransaction(userId, transactionId, { category }, version ?? result.rows[0].version, 'Category changed', true);
}

export async function updateTransaction(
  userId: number, id: string | number, changes: Partial<PersonalTransaction>, version: unknown, reason: string,
) {
  return changeTransaction(userId, id, changes, version, reason);
}

export async function reverseTransaction(userId: number, id: string | number, version: unknown, reason: string) {
  return changeTransaction(userId, id, null, version, reason);
}

async function changeTransaction(
  userId: number, id: string | number, changes: Partial<PersonalTransaction> | null,
  version: unknown, reason: string, categoryOnly = false,
): Promise<PersonalTransaction> {
  try {
    return await auditedTransaction(reason, async (client) => {
      const selected = await client.query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2 AND voided_at IS NULL',
        [accountId(id), userId]);
      if (!selected.rowCount) throw new BadRequestError('Active transaction not found for user.');
      const original = selected.rows[0];
      if (original.parent_transaction_id) throw new BadRequestError('Edit or reverse the parent transaction to correct its linked fee.');
      checkVersion(original, version);
      // Imports use batch -> sorted accounts -> transactions lock order, including undo.
      if (original.import_batch_id) {
        const batch = await client.query('SELECT status FROM import_batches WHERE id=$1 AND user_id=$2 FOR UPDATE',
          [original.import_batch_id, userId]);
        if (batch.rows[0]?.status !== 'committed') throw new ConflictError('This import is no longer active. Refresh its history.');
      }
      const before = mapTransactionRow(original);
      const allowed = ['account_id', 'amount', 'currency', 'type', 'date', 'description', 'category',
        'reference', 'transfer_account_id', 'fee_amount', 'fee_account_id'] as const;
      const patch = changes ? Object.fromEntries(allowed.filter((key) => Object.hasOwn(changes, key)).map((key) => [key, changes[key]])) : {};
      const after = changes && !categoryOnly ? normalizeTransaction({ ...before, ...patch }) : before;
      const fees = await client.query('SELECT * FROM transactions WHERE parent_transaction_id=$1 AND user_id=$2 AND voided_at IS NULL',
        [id, userId]);
      const ids = [...new Set([Number(before.account_id), Number(after.account_id),
        ...[before.transfer_account_id, after.transfer_account_id, before.fee_account_id, after.fee_account_id]
          .filter(Boolean).map(Number), ...fees.rows.map((row) => row.account_id)])].sort((a, b) => a - b);
      const owned = await client.query(
        'SELECT id,name,currency FROM accounts WHERE user_id=$1 AND id=ANY($2::int[]) AND is_active ORDER BY id FOR UPDATE',
        [userId, ids],
      );
      if (owned.rowCount !== ids.length) throw new BadRequestError('A transaction account is unavailable or not owned by you.');
      owned.rows.forEach((row) => requireKES(row.currency));
      const locked = await client.query('SELECT * FROM transactions WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, userId]);
      checkVersion(locked.rows[0], version);
      if (locked.rows[0].voided_at) throw new ConflictError('This transaction was reversed. Refresh the history.');
      const names = {
        account_name: owned.rows.find((row) => row.id === Number(after.account_id))?.name,
        transfer_account_name: owned.rows.find((row) => row.id === Number(after.transfer_account_id))?.name,
      };
      if (categoryOnly) {
        const result = await client.query('UPDATE transactions SET category=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
          [categoryInput(changes!.category), id, userId]);
        return mapTransactionRow({ ...result.rows[0], ...names });
      }
      const effects = new Map<number, number>();
      const accumulate = (movement: PersonalTransaction, direction: number, includeFee = false) => {
        for (const [account, delta] of ledgerEffects(movement, includeFee)) {
          effects.set(account, (effects.get(account) ?? 0) + direction * Math.round(delta * 100));
        }
      };
      accumulate(before, -1);
      fees.rows.forEach((fee) => accumulate(mapTransactionRow(fee), -1));
      let updated: DbRow;
      if (changes) {
        accumulate(after as PersonalTransaction, 1, true);
        const result = await client.query(`
          UPDATE transactions SET account_id=$1,amount=$2,currency='KES',type=$3,date=$4,description=$5,
            category=$6,reference=$7,transfer_account_id=$8,fee_amount=$9,fee_account_id=$10
          WHERE id=$11 AND user_id=$12 RETURNING *
        `, [after.account_id, after.amount, after.type, after.date, after.description, after.category,
          after.reference ?? null, after.transfer_account_id ?? null, after.fee_amount ?? 0,
          after.fee_account_id ?? null, id, userId]);
        updated = result.rows[0];
        if (after.fee_amount) {
          await client.query(`
            INSERT INTO transactions (user_id,account_id,amount,currency,type,date,description,category,
              import_source,parent_transaction_id,import_batch_id)
            VALUES ($1,$2,$3,'KES','expense',$4,'Transaction fee','Transaction Fees',$5,$6,$7)
            ON CONFLICT (parent_transaction_id) WHERE parent_transaction_id IS NOT NULL DO UPDATE
              SET account_id=EXCLUDED.account_id,amount=EXCLUDED.amount,date=EXCLUDED.date,
                category='Transaction Fees',voided_at=NULL
          `, [userId, after.fee_account_id, after.fee_amount, after.date, original.import_source,
            id, original.import_batch_id]);
        } else {
          await client.query('UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE parent_transaction_id=$1 AND user_id=$2 AND voided_at IS NULL',
            [id, userId]);
        }
      } else {
        const result = await client.query('UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 RETURNING *', [id, userId]);
        updated = result.rows[0];
        await client.query('UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE parent_transaction_id=$1 AND user_id=$2 AND voided_at IS NULL',
          [id, userId]);
      }
      for (const [account, cents] of effects) {
        if (cents) await client.query('UPDATE accounts SET current_balance=current_balance+$1 WHERE id=$2 AND user_id=$3',
          [cents / 100, account, userId]);
      }
      return mapTransactionRow({ ...updated, ...names });
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictError('This reference belongs to another active transaction.');
    throw error;
  }
}

function mapTransactionRow(r: DbRow): PersonalTransaction {
  const date = toDateString(r.date);
  if (!date) throw new Error(`Transaction ${r.id} has no date`);
  return {
    id: r.id, version: r.version, account_id: r.account_id, account_name: r.account_name,
    voided_at: r.voided_at ? new Date(r.voided_at).toISOString() : undefined,
    transfer_account_id: r.transfer_account_id ?? undefined,
    transfer_account_name: r.transfer_account_name,
    fee_amount: toMoney(r.fee_amount), fee_account_id: r.fee_account_id ?? undefined,
    parent_transaction_id: r.parent_transaction_id ?? undefined,
    import_batch_id: r.import_batch_id ?? undefined, source_fingerprint: r.source_fingerprint ?? undefined,
    amount: toMoney(r.amount), currency: r.currency || 'KES', type: r.type, date,
    description: r.description, category: r.category, reference: r.reference || undefined,
    import_source: r.import_source || 'manual',
  };
}
