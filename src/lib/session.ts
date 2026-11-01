/**
 * src/lib/session.ts
 *
 * Phase 2: Real server-side session resolution.
 *
 * Session token is stored as an httpOnly, Secure, SameSite=Lax cookie named
 * "tracksuite_session". Its value is the raw 64-char hex token stored in the
 * `sessions` table (not hashed — the session ID itself is unguessable,
 * 256 bits of randomness).
 *
 * Usage in Route Handlers and Server Components:
 *   const userId = await currentUserId();   // throws 401 if not signed in
 *   const user   = await currentUser();     // full UserRow
 */
import { cookies } from 'next/headers';
import { validateSession } from '@/lib/repo/auth';
import type { UserRow } from '@/lib/repo/auth';
import { UnauthorizedError } from '@/lib/errors';

// Renamed from 'hisa_session' with the HisaKenya -> Track-suite rebrand.
// Anyone holding the old cookie is simply treated as signed out and logs in
// again; the old rows stay in `sessions` until they expire.
export const SESSION_COOKIE = 'tracksuite_session';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

/**
 * Resolve the session from the request cookies.
 * Returns the full UserRow or null if not authenticated.
 */
export async function getSessionUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(token);
}

/**
 * Returns the current user ID.
 * Throws UnauthorizedError if the session is missing or expired — route
 * handlers must funnel their catch block through `apiError()` so this becomes
 * a 401 rather than a 500.
 */
export async function currentUserId(): Promise<number> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

/**
 * Returns the full current user.
 * Throws UnauthorizedError if not authenticated.
 */
export async function currentUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
