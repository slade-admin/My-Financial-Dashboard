import { Pool, types } from 'pg';

/**
 * Return SQL DATE columns as plain 'YYYY-MM-DD' strings.
 *
 * By default node-pg hydrates a DATE into a JS Date at LOCAL midnight. In
 * EAT (UTC+3) the stored date 2026-10-31 becomes 2026-10-31T00:00+03:00,
 * i.e. 2026-10-30T21:00Z, so the `.toISOString().split('T')[0]` used in the
 * mappers rendered it as 2026-10-30 — every date in the app was a day early
 * for any timezone ahead of UTC. Confirmed against a real row: the parser
 * produced 2026-10-31 and Postgres stored 2026-10-31, but the API returned
 * 2026-10-30.
 *
 * A DATE is a calendar date with no time and no zone, so converting it to an
 * instant is the mistake. Handing back the raw string keeps it unambiguous.
 * OID 1082 = date. TIMESTAMPTZ (1184) is deliberately left alone: those are
 * real instants and should stay Date objects.
 */
types.setTypeParser(1082, (val) => val);

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

export async function query(text: string, params?: unknown[]) {
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
