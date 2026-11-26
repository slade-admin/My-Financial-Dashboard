import type { Pool } from 'pg';
import { getPool } from '../db';

const financialTables = [
  'accounts', 'transactions', 'assets', 'liabilities', 'budgets',
  'savings_goals', 'goal_contributions', 'import_batches', 'record_history',
] as const;

export async function exportFinancialData(userId: number, pool: Pool = getPool()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const records: Record<string, unknown[]> = {};
    for (const table of financialTables) {
      records[table] = (await client.query(`SELECT * FROM ${table} WHERE user_id=$1 ORDER BY id`, [userId])).rows;
    }
    const categories = (await client.query('SELECT name,icon,color FROM categories ORDER BY name')).rows;
    await client.query('COMMIT');
    return {
      format: 'tracksuite-financial-export', version: 1, exported_at: new Date().toISOString(),
      owner_user_id: userId, records, shared_categories: categories,
      notes: [
        'Includes reversed transactions, retired budgets, contributions and change/import history without pagination limits.',
        'Monetary database columns are decimal strings; history JSON may contain numbers. Currency is stored per record.',
        'Excludes passwords, sessions, SMS tokens and login attempts. This is not a full PostgreSQL backup or an import file.',
        'Private financial data: store outside shared/synced folders and delete unwanted copies securely.',
      ],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
