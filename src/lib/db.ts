import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables. Database connection cannot be established.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables. Database connection is required.');
  }

  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export default getPool;
