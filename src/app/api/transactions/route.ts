import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(
      `SELECT * FROM transactions
       WHERE date >= NOW() - INTERVAL '30 days'
       ORDER BY date DESC`
    );

    return NextResponse.json({ transactions: result.rows });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
