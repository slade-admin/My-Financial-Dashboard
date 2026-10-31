/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 * Response: { user } + sets httpOnly session cookie
 *
 * Rate limited: 10 failed attempts per email per 15 minutes.
 * Uses constant-time comparison for passwords (argon2id).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyLogin,
  createSession,
  isRateLimited,
  recordLoginAttempt,
} from '@/lib/repo/auth';
import { SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/session';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password } = body as Record<string, string>;

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required' },
      { status: 400 },
    );
  }

  const identifier = email.toLowerCase().trim();

  try {
    if (await isRateLimited(identifier)) {
      return NextResponse.json(
        { error: 'Too many failed login attempts. Try again in 15 minutes.' },
        { status: 429 },
      );
    }

    const user = await verifyLogin(identifier, password);

    if (!user) {
      await recordLoginAttempt(identifier, false);
      // Generic message — don't leak whether email exists
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    await recordLoginAttempt(identifier, true);
    const token = await createSession(user.id);

    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return response;
  } catch (err) {
    console.error('[/api/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
