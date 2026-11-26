/**
 * src/lib/errors.ts
 *
 * Typed API errors + a single place to turn a thrown value into a Response.
 *
 * Why this exists: `currentUserId()` used to `throw new Response(...)`, which is
 * a Remix/React-Router idiom. Next.js App Router does NOT special-case a thrown
 * Response — it propagates to the route's own catch block (or to the framework)
 * and surfaces as a 500. That turned every expired-session request into a 500
 * instead of a 401. Route handlers now funnel every catch through
 * `apiError()`, which maps known error types to their correct status.
 */
import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { COOKIE_OPTIONS, SESSION_COOKIE } from './session-cookie';

/** Thrown when there is no valid session. Maps to 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** Thrown for caller-supplied bad input. Maps to 400. */
export class BadRequestError extends Error {
  constructor(message = 'Bad request') {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DatabaseUnavailableError extends Error {
  constructor(message = 'DATABASE_URL is not configured. Set it in .env.local and restart.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

/**
 * Convert a thrown value into a JSON Response.
 *
 * Known error types get their proper status. Everything else is logged
 * server-side and returned as a generic 500 — internal messages (Postgres
 * errors, stack traces) are never echoed to the client.
 */
export function apiError(err: unknown, context: string): NextResponse {
  unstable_rethrow(err);
  if (err instanceof UnauthorizedError) {
    const response = NextResponse.json({ error: 'Your session expired. Please sign in again.' }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  }
  if (err instanceof BadRequestError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message, needsReview: true }, { status: 409 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Defensive: a Response thrown from older code paths should still work.
  if (err instanceof Response) return err as unknown as NextResponse;

  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
  console.error(`[${context}]`, { name: err instanceof Error ? err.name : 'UnknownError', code });
  if (code === '42P01' || code === '42703') {
    return NextResponse.json({
      error: 'The database schema is not ready. Back up the database, run npm run migrate:up, and restart the application.',
      code: 'DATABASE_SCHEMA_OUTDATED', retryable: false,
    }, { status: 503 });
  }
  if (err instanceof DatabaseUnavailableError ||
      (code && ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPIPE',
        '08000', '08003', '08006', '28P01', '28000', '53300', '57P01', '57P02', '57P03', '40001', '40P01'].includes(code)) ||
      (err instanceof Error && /timeout exceeded when trying to connect|connection terminated|connection timeout/i.test(err.message))) {
    return NextResponse.json({
      error: 'Database unavailable. Check PostgreSQL and DATABASE_URL, then retry the same form. Do not create another copy of an uncertain save.',
      code: 'DATABASE_UNAVAILABLE', retryable: true,
    }, { status: 503, headers: { 'Retry-After': '5' } });
  }
  if (code === '23505') {
    return NextResponse.json({ error: 'This record already exists. Reload and review it before retrying.' }, { status: 409 });
  }
  return NextResponse.json(
    { error: 'Something went wrong. Please try again.' },
    { status: 500 },
  );
}
