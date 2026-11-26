import { NextResponse } from 'next/server';
import { getNetWorthMetrics, isDbConnected } from '@/lib/store';
import { apiError } from '@/lib/errors';

export async function GET() {
  try {
    const metrics = await getNetWorthMetrics();
    const dbConnected = await isDbConnected();

    return NextResponse.json({
      ...metrics,
      isDatabaseConnected: dbConnected,
    });
  } catch (error) {
    return apiError(error, 'GET /api/networth');
  }
}
