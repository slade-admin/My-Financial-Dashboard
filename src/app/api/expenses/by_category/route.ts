import { NextResponse } from 'next/server';
import { getExpensesByCategory } from '@/lib/store';

export async function GET() {
  try {
    const expenses = await getExpensesByCategory();
    return NextResponse.json({ categories: expenses, expenses });
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses by category' },
      { status: 500 }
    );
  }
}
