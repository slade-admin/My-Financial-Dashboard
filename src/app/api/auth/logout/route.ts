/**
 * POST /api/auth/logout
 *
 * Deletes the server-side session and clears the cookie.
 * Safe to call even when not logged in.
 */
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/repo/auth';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      await deleteSession(token);
    } catch (err) {
      // Log but don't fail — always clear the cookie
      console.error('[/api/auth/logout] deleteSession failed:', err);
    }
  }

  const response = NextResponse.json({ ok: true });
  // Expire the cookie immediately
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
