import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { getPool, query } from '../db';
import { accountId } from '../money';
import { BadRequestError, ConflictError } from '../errors';
import { textInput, uuidInput, versionInput } from '../validation';
import type { DbRow, HistoryEntry } from './types';

export async function auditedTransaction<T>(reason: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const note = textInput(reason, 'Change reason', 500);
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.change_reason', $1, true)", [note]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export function checkVersion(row: DbRow, version: unknown): void {
  if (row.version !== versionInput(version)) {
    throw new ConflictError('This record changed since you opened it. Refresh and review the latest values before retrying.');
  }
}

type EditableTable = 'accounts' | 'assets' | 'liabilities' | 'savings_goals';

export async function insertRecord(
  client: PoolClient, userId: number, table: EditableTable, values: Record<string, unknown>, requestId?: unknown,
): Promise<{ row: DbRow; created: boolean }> {
  const key = requestId === undefined ? null : uuidInput(requestId);
  const hash = key ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : null;
  const fields = ['user_id', ...Object.keys(values), 'creation_request_id', 'creation_hash'];
  const result = await client.query(
    `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')})
      ON CONFLICT (user_id,creation_request_id) DO NOTHING RETURNING *`,
    [userId, ...Object.values(values), key, hash],
  );
  if (result.rowCount) return { row: result.rows[0], created: true };
  const existing = await client.query(`SELECT * FROM ${table} WHERE user_id=$1 AND creation_request_id=$2`, [userId, key]);
  if (!existing.rowCount || existing.rows[0].creation_hash !== hash) {
    throw new ConflictError('This save request was already used with different details. Reload and review the existing record.');
  }
  return { row: existing.rows[0], created: false };
}

export async function editRecord(
  userId: number, table: EditableTable, id: string | number, version: unknown,
  values: Record<string, unknown>, reason: string,
): Promise<DbRow> {
  return auditedTransaction(reason, async (client) => {
    const result = await client.query(
      `SELECT * FROM ${table} WHERE id=$1 AND user_id=$2${table === 'accounts' ? ' AND is_active' : ''} FOR UPDATE`,
      [accountId(id), userId],
    );
    if (!result.rowCount) throw new BadRequestError('Record not found for user.');
    checkVersion(result.rows[0], version);
    const fields = Object.keys(values);
    const updated = await client.query(
      `UPDATE ${table} SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')}
        WHERE id=$${fields.length + 1} AND user_id=$${fields.length + 2} RETURNING *`,
      [...Object.values(values), id, userId],
    );
    return updated.rows[0];
  });
}

export async function getRecordHistory(userId: number, entity: string, id: string | number, page = 0) {
  if (!['account', 'transaction', 'asset', 'liability', 'goal', 'budget'].includes(entity)) {
    throw new BadRequestError('Invalid history record type.');
  }
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(page * 20)) throw new BadRequestError('Invalid history page.');
  const result = await query(
    `SELECT * FROM record_history WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3
      ORDER BY id DESC LIMIT 21 OFFSET $4`, [userId, entity, accountId(id), page * 20],
  );
  const entries: HistoryEntry[] = result.rows.slice(0, 20).map((row) => ({
    id: String(row.id), action: row.action, reason: row.reason, before: row.before_data,
    after: row.after_data, created_at: new Date(row.created_at).toISOString(),
  }));
  return { entries, hasMore: result.rows.length > 20 };
}
