import { NextResponse } from 'next/server';
import { wealthEngine } from '@/lib/wealth';

export async function GET() {
  const holdings = wealthEngine.getHoldings();
  const summary = wealthEngine.getPortfolioSummary();
  const projections = wealthEngine.projectHoldingsYield(12);

  return NextResponse.json({
    summary,
    holdings,
    projections,
  });
}
