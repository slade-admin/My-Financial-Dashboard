import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const result = await query(
      `SELECT
        COALESCE(t.category, c.name, 'Other') as category,
        COALESCE(c.icon, '📦') as icon,
        COALESCE(c.color, '#BDC3C7') as color,
        SUM(t.amount) as total_amount,
        COUNT(*) as transaction_count
       FROM transactions t
       LEFT JOIN categories c ON t.category = c.name
       WHERE t.date >= NOW() - INTERVAL '30 days'
       GROUP BY t.category, c.name, c.icon, c.color
       ORDER BY total_amount DESC`
    );

    return NextResponse.json({ expenses: result.rows });
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expenses by category' },
      { status: 500 }
    );
  }
}
