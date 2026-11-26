import { NextResponse } from 'next/server';
import { getCategories } from '@/lib/store';
import { apiError } from '@/lib/errors';

export async function GET() {
  try { return NextResponse.json({ categories: await getCategories() }); }
  catch (error) { return apiError(error, 'GET /api/categories'); }
}
