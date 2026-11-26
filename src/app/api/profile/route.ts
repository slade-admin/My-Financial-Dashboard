/**
 * GET  /api/profile  → returns current user's profile
 * PUT  /api/profile  → updates name, phone, country, dob
 */
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { updateProfile } from '@/lib/repo/auth';
import { apiError, BadRequestError } from '@/lib/errors';

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

    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestError('A JSON object is required.');
    const { full_name, phone_number, country, dob } = body as Record<string, string>;
    if ([full_name, phone_number, country, dob].every((field) => field === undefined)) {
      throw new BadRequestError('No profile fields supplied.');
    }

    const updated = await updateProfile(user.id, { full_name, phone_number, country, dob });
    return NextResponse.json({ user: updated });
  } catch (error) {
    return apiError(error, 'PUT /api/profile');
  }
}
