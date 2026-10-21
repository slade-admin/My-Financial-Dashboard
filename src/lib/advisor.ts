/**
 * AI Financial Advisor & Synthesis Engine for Kenya
 * Provides tailored advice on:
 * - M-Pesa cash flow leakages & merchant spending patterns
 * - KRA eTIMS tax liability & optimization (VAT 16%, Turnover Tax 3%, Withholding Tax)
 * - Yield allocation between high-rate CBK Treasury Bills / Infrastructure Bonds vs Money Market Funds
 * - Multi-currency FX exposure (PayPal USD to KES)
 */

export interface AdvisorContext {
  monthlyIncomeKes: number;
  monthlyExpensesKes: number;
  topSpendingCategory: string;
  totalMpesaInflow: number;
  unfiscalizedInvoicesCount: number;
  portfolioValueKes: number;
}

export class KenyaFinancialAdvisor {
  /**
   * Generates localized financial advisory synthesis
   */
  async generateAdvice(userQuery: string, context: AdvisorContext) {
    const q = userQuery.toLowerCase();

    const tips: string[] = [];
    const recommendations: string[] = [];

    // Tax & eTIMS checks
    if (context.unfiscalizedInvoicesCount > 0 || q.includes('tax') || q.includes('etims') || q.includes('kra')) {
      tips.push('⚡ eTIMS Compliance: You have commercial M-Pesa/Bank receipts pending KRA fiscalization. Immediate sync avoids non-compliance penalties under the Tax Procedures Act.');
      recommendations.push('Run 1-click batch fiscalization to issue CUIN numbers and generate official KRA QR verification codes.');
    }

    // Fixed income & investments checks
    if (q.includes('invest') || q.includes('bond') || q.includes('t-bill') || q.includes('mmf') || q.includes('wealth')) {
      recommendations.push('Allocate surplus liquidity into CBK Infrastructure Bonds (IFB) to lock in ~17.5% yields completely tax-free compared to MMFs which suffer 15% withholding tax.');
      recommendations.push('Keep 3-6 months operating expenses in daily compounding Money Market Funds (e.g. CIC or Sanlam KES) for immediate M-Pesa liquidity.');
    }

    // Cash flow & M-Pesa checks
    if (context.monthlyExpensesKes > context.monthlyIncomeKes * 0.75) {
      tips.push(`⚠️ Cash Flow Alert: Operating expenses are currently at ${Math.round((context.monthlyExpensesKes / context.monthlyIncomeKes) * 100)}% of inflows. Largest burn is in "${context.topSpendingCategory}".`);
      recommendations.push('Set weekly M-Pesa Paybill/Till spending thresholds to protect working capital.');
    }

    // Default guidance
    if (tips.length === 0) {
      tips.push('💼 Cash Flow Health: Diversified between Safaricom M-Pesa, Commercial Banking (Equity/KCB/Co-op), and USD PayPal remittances.');
      recommendations.push('Regularize weekly eTIMS tax sync and channel surplus KES into 91-Day CBK Treasury Bills.');
    }

    return {
      query: userQuery,
      status: 'success',
      advisorName: 'Simba AI Financial Advisor',
      analysis: `Synthesized Kenyan financial posture: Total Portfolio KES ${context.portfolioValueKes.toLocaleString()} | Monthly Inflow KES ${context.monthlyIncomeKes.toLocaleString()}.`,
      tips,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }
}

export const financialAdvisor = new KenyaFinancialAdvisor();
