/**
 * src/lib/crypto.ts
 *
 * Centralised crypto helpers.
 *  - randomToken()  → cryptographically random hex string (32 bytes → 64 hex chars)
 *  - hashToken()    → argon2id hash (for session IDs stored server-side is overkill,
 *                     but we use it for ingest tokens that are bearer tokens)
 *  - verifyToken()  → constant-time argon2id verify
 *
 * Passwords use argon2id via the same hash/verify helpers.
 */
import crypto from 'crypto';
import * as argon2 from 'argon2';

/** 32-byte cryptographically random hex token (64 chars). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Argon2id hash.
 * Uses the library's default parameters (memory=65536 KiB, iterations=3, parallelism=4).
 * These defaults meet OWASP recommendations for argon2id.
 */
export async function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, { type: argon2.argon2id });
}

/** Constant-time verify. Returns false (never throws) on mismatch. */
export async function verifySecret(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
