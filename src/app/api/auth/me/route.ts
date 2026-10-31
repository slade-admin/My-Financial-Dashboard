/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Used by the frontend to check session state on load.
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ user });
}
