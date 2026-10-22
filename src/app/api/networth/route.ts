import { NextResponse } from 'next/server';
import { getNetWorthMetrics, isDbConnected } from '@/lib/store';

export async function GET() {
  try {
    const metrics = await getNetWorthMetrics();
    const dbConnected = await isDbConnected();

    return NextResponse.json({
      ...metrics,
      isDatabaseConnected: dbConnected,
    });
  } catch (error: any) {
    console.error('Error fetching net worth metrics:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch net worth metrics' }, { status: 500 });
  }
}
