import { NextResponse } from 'next/server';
import { getExpensesByCategory } from '@/lib/store';
import { apiError } from '@/lib/errors';

// Reads the session via cookies() — never prerenderable, and the build logs a
// benign HANGING_PROMISE_REJECTION for it. See the note in
// src/app/api/networth/route.ts for why `export const dynamic` is NOT the fix.
export async function GET() {
  try {
    const expenses = await getExpensesByCategory();
    return NextResponse.json({ categories: expenses, expenses });
  } catch (error) {
    return apiError(error, 'GET /api/expenses/by_category');
  }
}
