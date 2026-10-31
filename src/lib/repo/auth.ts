/**
 * src/lib/repo/auth.ts
 *
 * Data-access layer for authentication and profiles.
 * All queries are parameterised — no string interpolation of user input.
 */
import { getPool } from '@/lib/db';
import { hashSecret, verifySecret, randomToken } from '@/lib/crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  email: string;
  full_name: string;
  phone_number: string | null;
  country: string;
  dob: string | null; // ISO date string
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface IngestTokenRow {
  id: number;
  user_id: number;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
  // token_hash and selector intentionally omitted — never returned to callers
}

/**
 * A real argon2id hash of a throwaway secret, computed once on first use.
 *
 * Used to equalise login timing for unknown emails. The previous
 * implementation verified against the literal string
 * '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy', which is not valid argon2
 * encoding — argon2.verify() rejected it instantly instead of doing the work,
 * so unknown emails returned measurably faster than known ones and the
 * enumeration defence was inverted. Hashing a real value fixes that.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashSecret(randomToken(16));
  return dummyHashPromise;
}

// ─── Users ───────────────────────────────────────────────────────────────────

/** Create a new user. Returns the created row or throws on duplicate email. */
export async function createUser(input: {
  email: string;
  password: string;
  full_name: string;
  phone_number?: string;
  country?: string;
  dob?: string;
}): Promise<UserRow> {
  const pool = getPool();
  const hash = await hashSecret(input.password);

  const result = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, full_name, phone_number, country, dob)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, full_name, phone_number, country, dob, created_at`,
    [
      input.email.toLowerCase().trim(),
      hash,
      input.full_name.trim(),
      input.phone_number ?? null,
      input.country ?? 'KE',
      input.dob ?? null,
    ],
  );
  return result.rows[0];
}

/** Look up a user by email, verify password, return user or null. */
export async function verifyLogin(
  email: string,
  password: string,
): Promise<UserRow | null> {
  const pool = getPool();
  const result = await pool.query<UserRow & { password_hash: string }>(
    `SELECT id, email, full_name, phone_number, country, dob, created_at, password_hash
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );

  if (result.rows.length === 0) {
    // Verify against a real hash so an unknown email costs the same wall-clock
    // time as a known one. See getDummyHash() for why this matters.
    await verifySecret(await getDummyHash(), password);
    return null;
  }

  const row = result.rows[0];
  const ok = await verifySecret(row.password_hash, password);
  if (!ok) return null;

  const { password_hash: _ph, ...user } = row;
  return user as UserRow;
}

/** Get a user by ID (for session validation). */
export async function getUserById(id: number): Promise<UserRow | null> {
  const pool = getPool();
  const result = await pool.query<UserRow>(
    `SELECT id, email, full_name, phone_number, country, dob, created_at
     FROM users WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Update profile fields. Only updates provided fields. */
export async function updateProfile(
  userId: number,
  input: {
    full_name?: string;
    phone_number?: string;
    country?: string;
    dob?: string;
  },
): Promise<UserRow> {
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (input.full_name !== undefined) {
    sets.push(`full_name = $${idx++}`);
    values.push(input.full_name.trim());
  }
  if (input.phone_number !== undefined) {
    sets.push(`phone_number = $${idx++}`);
    values.push(input.phone_number);
  }
  if (input.country !== undefined) {
    sets.push(`country = $${idx++}`);
    values.push(input.country);
  }
  if (input.dob !== undefined) {
    sets.push(`dob = $${idx++}`);
    values.push(input.dob);
  }

  if (sets.length === 0) throw new Error('No fields to update');

  values.push(userId);
  const result = await pool.query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
     RETURNING id, email, full_name, phone_number, country, dob, created_at`,
    values,
  );
  return result.rows[0];
}

// ─── Sessions ────────────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 30;

/** Create a new session. Returns the raw token (set as cookie value). */
export async function createSession(userId: number): Promise<string> {
  const pool = getPool();
  const token = randomToken(32); // 64-char hex
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await pool.query(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt],
  );

  return token;
}

/**
 * Validate a session token.
 * Returns the associated UserRow if valid and not expired, otherwise null.
 * Also extends the expiry on each use (sliding window).
 */
export async function validateSession(token: string): Promise<UserRow | null> {
  if (!token || token.length !== 64) return null;

  const pool = getPool();
  const now = new Date();
  const newExpiry = new Date(
    now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await pool.query<UserRow>(
    `UPDATE sessions SET expires_at = $1
     WHERE id = $2 AND expires_at > NOW()
     RETURNING user_id`,
    [newExpiry, token],
  );

  if (result.rows.length === 0) return null;

  const userId = (result.rows[0] as unknown as { user_id: number }).user_id;
  return getUserById(userId);
}

/** Delete a single session (logout). */
export async function deleteSession(token: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [token]);
}

/** Delete all sessions for a user (logout everywhere). */
export async function deleteAllSessions(userId: number): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

// ─── Rate limiting (login attempts) ─────────────────────────────────────────

const RATE_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

/** Record a login attempt. Returns whether the identifier is currently locked out. */
export async function recordLoginAttempt(
  identifier: string,
  succeeded: boolean,
): Promise<{ locked: boolean }> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO login_attempts (identifier, succeeded) VALUES ($1, $2)`,
    [identifier, succeeded],
  );

  if (succeeded) return { locked: false };

  const windowStart = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000);
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM login_attempts
     WHERE identifier = $1 AND attempted_at > $2 AND succeeded = FALSE`,
    [identifier, windowStart],
  );

  return { locked: parseInt(countResult.rows[0].count, 10) >= MAX_ATTEMPTS };
}

/** Check if an identifier is currently locked (without recording an attempt). */
export async function isRateLimited(identifier: string): Promise<boolean> {
  const pool = getPool();
  const windowStart = new Date(Date.now() - RATE_WINDOW_MINUTES * 60 * 1000);
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM login_attempts
     WHERE identifier = $1 AND attempted_at > $2 AND succeeded = FALSE`,
    [identifier, windowStart],
  );
  return parseInt(result.rows[0].count, 10) >= MAX_ATTEMPTS;
}

// ─── Ingest tokens ───────────────────────────────────────────────────────────

/**
 * Create an ingest token.
 * Returns the plaintext token ONCE — it is not retrievable again.
 *
 * Format: "<selector>.<verifier>" (see migration 1700000000002).
 * The selector is stored plaintext for O(1) lookup; only the verifier is hashed.
 */
export async function createIngestToken(
  userId: number,
  label?: string,
): Promise<{ token: string; row: IngestTokenRow }> {
  const pool = getPool();
  const selector = randomToken(12); // 24 hex chars, fits VARCHAR(32)
  const verifier = randomToken(32); // 64 hex chars — the actual secret
  const hash = await hashSecret(verifier);

  const result = await pool.query<IngestTokenRow>(
    `INSERT INTO ingest_tokens (user_id, selector, token_hash, label)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, label, last_used_at, created_at`,
    [userId, selector, hash, label ?? null],
  );

  return { token: `${selector}.${verifier}`, row: result.rows[0] };
}

/** List all ingest tokens for a user (without hashes). */
export async function listIngestTokens(
  userId: number,
): Promise<IngestTokenRow[]> {
  const pool = getPool();
  const result = await pool.query<IngestTokenRow>(
    `SELECT id, user_id, label, last_used_at, created_at
     FROM ingest_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
}

/**
 * Validate a bearer ingest token.
 * Returns the user ID if valid, null otherwise.
 * Updates last_used_at on success.
 */
export async function validateIngestToken(
  plain: string,
): Promise<number | null> {
  if (!plain) return null;

  // "<selector>.<verifier>" — exactly one dot.
  const dot = plain.indexOf('.');
  if (dot <= 0 || dot === plain.length - 1) return null;
  const selector = plain.slice(0, dot);
  const verifier = plain.slice(dot + 1);
  if (selector.length > 32) return null;

  const pool = getPool();
  const rows = await pool.query<{ id: number; user_id: number; token_hash: string }>(
    `SELECT id, user_id, token_hash FROM ingest_tokens WHERE selector = $1`,
    [selector],
  );

  if (rows.rows.length === 0) {
    // Equalise timing against the valid-selector path.
    await verifySecret(await getDummyHash(), verifier);
    return null;
  }

  const row = rows.rows[0];
  if (!(await verifySecret(row.token_hash, verifier))) return null;

  await pool.query(
    `UPDATE ingest_tokens SET last_used_at = NOW() WHERE id = $1`,
    [row.id],
  );
  return row.user_id;
}

/** Delete an ingest token by ID (scoped to user). */
export async function deleteIngestToken(
  userId: number,
  tokenId: number,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM ingest_tokens WHERE id = $1 AND user_id = $2`,
    [tokenId, userId],
  );
}
