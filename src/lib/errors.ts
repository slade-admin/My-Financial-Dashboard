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

/**
 * Convert a thrown value into a JSON Response.
 *
 * Known error types get their proper status. Everything else is logged
 * server-side and returned as a generic 500 — internal messages (Postgres
 * errors, stack traces) are never echoed to the client.
 */
export function apiError(err: unknown, context: string): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (err instanceof BadRequestError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Defensive: a Response thrown from older code paths should still work.
  if (err instanceof Response) return err as unknown as NextResponse;

  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: 'Something went wrong. Please try again.' },
    { status: 500 },
  );
}
