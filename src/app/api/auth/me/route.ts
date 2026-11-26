/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Used by the frontend to check session state on load.
 */
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { apiError } from '@/lib/errors';

export async function GET() {
  try { return NextResponse.json({ user: await currentUser() }); }
  catch (error) { return apiError(error, 'GET /api/auth/me'); }
}
