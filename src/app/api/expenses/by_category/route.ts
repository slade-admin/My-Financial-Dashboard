import { NextResponse } from 'next/server';
import { getExpensesByCategory } from '@/lib/store';
import { apiError } from '@/lib/errors';

export async function GET() {
  try {
    const expenses = await getExpensesByCategory();
    return NextResponse.json({ categories: expenses, expenses });
  } catch (error) {
    return apiError(error, 'GET /api/expenses/by_category');
  }
}
