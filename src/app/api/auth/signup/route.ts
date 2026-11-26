/**
 * POST /api/auth/signup
 *
 * Body: { email, password, full_name, phone_number?, country?, dob? }
 * Response: { user } + sets httpOnly session cookie
 *
 * Rate limited to 5 signup attempts per IP per 15 minutes (piggybacks
 * login_attempts table with identifier = ip:signup).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/repo/auth';
import { createSession, isRateLimited, recordLoginAttempt } from '@/lib/repo/auth';
import { SESSION_COOKIE, COOKIE_OPTIONS } from '@/lib/session';
import { apiError } from '@/lib/errors';
import { emailInput, objectInput, passwordInput, textInput } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const identifier = `signup:${ip}`;

  try {
    if (await isRateLimited(identifier)) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please wait 15 minutes.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const input = objectInput(body);
    const user = await createUser({
      email: emailInput(input.email),
      password: passwordInput(input.password, true),
      full_name: textInput(input.full_name, 'Full name', 255),
      phone_number: input.phone_number as string | undefined,
      country: input.country as string | undefined,
      dob: input.dob as string | undefined,
    });

    await recordLoginAttempt(identifier, true);

    const token = await createSession(user.id);

    const response = NextResponse.json({ user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return response;
  } catch (err: unknown) {
    // 23505 = unique_violation. Matching the SQLSTATE code is exact; the
    // previous substring match on the message text would break on a locale
    // change or a reworded driver error.
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }
    return apiError(err, 'POST /api/auth/signup');
  }
}
