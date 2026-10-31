/**
 * GET  /api/profile  → returns current user's profile
 * PUT  /api/profile  → updates name, phone, country, dob
 */
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { updateProfile } from '@/lib/repo/auth';
import { apiError } from '@/lib/errors';

export async function GET() {
  try {
    const user = await currentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error, 'GET /api/profile');
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await currentUser();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { full_name, phone_number, country, dob } = body as Record<string, string>;

    const updated = await updateProfile(user.id, { full_name, phone_number, country, dob });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return apiError(error, 'PUT /api/profile');
  }
}
