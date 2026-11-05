import { getPool, query } from '../db';
import {
  PersonalTransaction,
  TransactionFilters,
  AddTransactionResult,
  toMoney,
  toDateString, DbRow
} from './types';

export async function getTransactions(
  userId: number,
  filters?: TransactionFilters
): Promise<PersonalTransaction[]> {
  const conditions: string[] = ['t.user_id = $1'];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (filters?.category && filters.category !== 'All') {
    conditions.push(`LOWER(t.category) = LOWER($${paramIdx})`);
    params.push(filters.category);
    paramIdx++;
  }

  if (filters?.accountId && filters.accountId !== 'All') {
    conditions.push(`t.account_id = $${paramIdx}`);
    params.push(filters.accountId);
    paramIdx++;
  }

  if (filters?.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    conditions.push(
      `(LOWER(t.description) LIKE $${paramIdx} OR LOWER(t.category) LIKE $${paramIdx} OR LOWER(COALESCE(t.reference, '')) LIKE $${paramIdx})`
    );
    params.push(term);
    paramIdx++;
  }

  const limit = filters?.limit || 100;
  const sql = `
    SELECT t.*, a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  const res = await query(sql, params);
  return res.rows.map(mapTransactionRow);
}

export async function addTransaction(
  userId: number,
  tx: Omit<PersonalTransaction, 'id'>
): Promise<AddTransactionResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock account for update to guarantee single atomic transaction for insertion + balance
    const accRes = await client.query(
      'SELECT id, current_balance FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [tx.account_id, userId]
    );

    if (accRes.rowCount === 0) {
      throw new Error(`Account ${tx.account_id} not found for user ${userId}`);
    }

    const cleanAmount = toMoney(tx.amount);
    const reference = tx.reference?.trim() || null;

    // 2. Insert transaction with idempotency on (user_id, reference)
    let insertRes;
    if (reference) {
      insertRes = await client.query(
        `INSERT INTO transactions (user_id, account_id, amount, currency, type, date, description, category, reference, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, reference) DO NOTHING
         RETURNING *`,
        [
          userId,
          tx.account_id,
          cleanAmount,
          tx.currency || 'KES',
          tx.type,
          tx.date,
          tx.description,
          tx.category,
          reference,
          tx.import_source || 'manual',
        ]
      );
    } else {
      insertRes = await client.query(
        `INSERT INTO transactions (user_id, account_id, amount, currency, type, date, description, category, reference, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9)
         RETURNING *`,
        [
          userId,
          tx.account_id,
          cleanAmount,
          tx.currency || 'KES',
          tx.type,
          tx.date,
          tx.description,
          tx.category,
          tx.import_source || 'manual',
        ]
      );
    }

    // 3. Check for deduplication
    if (!insertRes || insertRes.rowCount === 0) {
      // Conflict occurred: transaction already exists!
      // Commit without altering account balance to keep operations idempotent
      const existingRes = await client.query(
        `SELECT t.*, a.name AS account_name
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.user_id = $1 AND t.reference = $2`,
        [userId, reference]
      );
      await client.query('COMMIT');

      const existingRow = existingRes.rows[0];
      return {
        transaction: mapTransactionRow(existingRow),
        isDuplicate: true,
      };
    }

    // 4. Update account balance atomically within the same database transaction
    const delta =
      tx.type === 'income'
        ? cleanAmount
        : tx.type === 'expense'
        ? -cleanAmount
        : 0;

    if (delta !== 0) {
      await client.query(
        `UPDATE accounts
         SET current_balance = current_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3`,
        [delta, tx.account_id, userId]
      );
    }

    await client.query('COMMIT');

    const inserted = insertRes.rows[0];
    const accRow = accRes.rows[0];
    inserted.account_name = accRow.name;

    return {
      transaction: mapTransactionRow(inserted),
      isDuplicate: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTransactionCategory(
  userId: number,
  transactionId: string | number,
  category: string,
): Promise<PersonalTransaction | null> {
  const res = await query(
    `UPDATE transactions
     SET category = $1
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [category.trim(), transactionId, userId],
  );
  if (res.rowCount === 0) return null;
  return mapTransactionRow(res.rows[0]);
}

function mapTransactionRow(r: DbRow): PersonalTransaction {
  // transactions.date is NOT NULL in the schema, so this is always present.
  // Throwing rather than defaulting to today: a missing date means the row is
  // corrupt, and silently inventing one would hide that.
  const dateStr = toDateString(r.date);
  if (!dateStr) throw new Error(`Transaction ${r.id} has no date`);

  return {
    id: r.id,
    account_id: r.account_id,
    account_name: r.account_name,
    amount: toMoney(r.amount),
    currency: r.currency || 'KES',
    type: r.type,
    date: dateStr,
    description: r.description,
    category: r.category,
    reference: r.reference || undefined,
    import_source: r.import_source || 'manual',
  };
}
