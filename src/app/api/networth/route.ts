import { NextResponse } from 'next/server';
import { getNetWorthMetrics, isDbConnected } from '@/lib/store';
import { apiError } from '@/lib/errors';

/**
 * This handler reads the session (and therefore `cookies()`), so it is never
 * prerenderable and Next emits it as dynamic. The build still logs a
 * HANGING_PROMISE_REJECTION for it: Next attempts a prerender, hits cookies(),
 * and aborts, leaving that promise unsettled. The warning is benign — Route
 * Handlers are not cached by default, so no request is served stale.
 *
 * Do NOT "fix" it with `export const dynamic = 'force-dynamic'`: that route
 * segment config is rejected outright when nextConfig.cacheComponents is on
 * and fails the build.
 */
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
