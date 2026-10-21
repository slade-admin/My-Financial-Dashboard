import { NextResponse } from 'next/server';
import { financialAdvisor } from '@/lib/advisor';
import { getAccounts, getTransactions, getEtimsInvoices } from '@/lib/store';
import { wealthEngine } from '@/lib/wealth';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const txs = await getTransactions();
    const debits = txs.filter((t) => t.type === 'debit').reduce((sum, t) => sum + (t.currency === 'USD' ? t.amount * 130.5 : t.amount), 0);
    const credits = txs.filter((t) => t.type === 'credit').reduce((sum, t) => sum + (t.currency === 'USD' ? t.amount * 130.5 : t.amount), 0);
    const mpesaCredits = txs.filter((t) => t.source_rail === 'MPESA_DARAJA' && t.type === 'credit').reduce((sum, t) => sum + t.amount, 0);
    const unfiscalized = txs.filter((t) => t.etims_status === 'UNFISCALIZED').length;
    const wealthSummary = wealthEngine.getPortfolioSummary();

    const advice = await financialAdvisor.generateAdvice(message, {
      monthlyExpensesKes: debits,
      monthlyIncomeKes: credits || 150000,
      topSpendingCategory: 'Food & Supermarkets',
      totalMpesaInflow: mpesaCredits,
      unfiscalizedInvoicesCount: unfiscalized,
      portfolioValueKes: wealthSummary.totalValuation,
    });

    return NextResponse.json(advice);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
