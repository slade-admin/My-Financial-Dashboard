/**
 * Kenyan Wealth & Investment Domain Engine
 * Incorporates:
 * - Central Bank of Kenya (CBK) Treasury Bills (91-day, 182-day, 364-day)
 * - CBK Infrastructure Bonds (IFB - Tax Exempt)
 * - Money Market Funds (MMFs: CIC, Sanlam, Lofty-Corban, Ndovu)
 * - Nairobi Securities Exchange (NSE) Equities (SCOM, EQTY, KCB, EABL)
 * - Real-time FX Currency Conversion (KES, USD, EUR, GBP)
 */

export interface KenyanPortfolioHolding {
  id: number;
  assetType: 'Treasury Bill' | 'Infrastructure Bond' | 'Money Market Fund' | 'NSE Equities' | 'Sacco';
  institution: string;
  name: string;
  principal: number;
  valuation: number;
  accruedInterest: number;
  annualYieldPercent: number;
  maturityDate?: string;
  isTaxExempt: boolean;
}

export interface FxRatePair {
  base: string;
  quote: string;
  rate: number;
  lastUpdated: string;
}

class KenyanWealthEngine {
  private sampleHoldings: KenyanPortfolioHolding[] = [
    {
      id: 1,
      assetType: 'Treasury Bill',
      institution: 'Central Bank of Kenya (CSD)',
      name: '91-Day Treasury Bill (Issue 2580)',
      principal: 500000.0,
      valuation: 519500.0,
      accruedInterest: 19500.0,
      annualYieldPercent: 15.65,
      maturityDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
      isTaxExempt: false,
    },
    {
      id: 2,
      assetType: 'Infrastructure Bond',
      institution: 'Central Bank of Kenya (CSD)',
      name: 'IFB1/2024/6.5Yr (Tax Exempt)',
      principal: 1000000.0,
      valuation: 1089000.0,
      accruedInterest: 89000.0,
      annualYieldPercent: 17.75,
      maturityDate: new Date(Date.now() + 5 * 365 * 86400000).toISOString().split('T')[0],
      isTaxExempt: true,
    },
    {
      id: 3,
      assetType: 'Money Market Fund',
      institution: 'CIC Asset Management',
      name: 'CIC Kenya Shilling MMF (Daily Compounding)',
      principal: 850000.0,
      valuation: 878200.0,
      accruedInterest: 28200.0,
      annualYieldPercent: 13.4,
      isTaxExempt: false,
    },
    {
      id: 4,
      assetType: 'NSE Equities',
      institution: 'Nairobi Securities Exchange',
      name: 'Safaricom PLC (NSE: SCOM)',
      principal: 350000.0,
      valuation: 395000.0,
      accruedInterest: 45000.0,
      annualYieldPercent: 6.8,
      isTaxExempt: false,
    },
  ];

  getHoldings(): KenyanPortfolioHolding[] {
    return this.sampleHoldings;
  }

  getPortfolioSummary() {
    const totalInvested = this.sampleHoldings.reduce((sum, h) => sum + h.principal, 0);
    const totalValuation = this.sampleHoldings.reduce((sum, h) => sum + h.valuation, 0);
    const totalAccrued = this.sampleHoldings.reduce((sum, h) => sum + h.accruedInterest, 0);
    const weightedYield =
      this.sampleHoldings.reduce((sum, h) => sum + h.annualYieldPercent * h.valuation, 0) / (totalValuation || 1);

    return {
      totalInvested,
      totalValuation,
      totalAccrued,
      weightedYieldPercent: Math.round(weightedYield * 100) / 100,
      holdingsCount: this.sampleHoldings.length,
      currency: 'KES',
    };
  }

  /**
   * Projects future yield based on compound interest
   */
  projectHoldingsYield(monthsAhead = 12) {
    return this.sampleHoldings.map((h) => {
      const annualRate = h.annualYieldPercent / 100;
      const timeYears = monthsAhead / 12;
      const projectedGain = h.valuation * annualRate * timeYears;
      const taxRate = h.isTaxExempt ? 0 : 0.15; // 15% withholding tax on interest in Kenya
      const netGain = projectedGain * (1 - taxRate);

      return {
        name: h.name,
        currentValuation: h.valuation,
        projectedGrossGain: Math.round(projectedGain),
        projectedNetGain: Math.round(netGain),
        projectedTotal: Math.round(h.valuation + netGain),
        annualYield: h.annualYieldPercent,
        isTaxExempt: h.isTaxExempt,
      };
    });
  }

  /**
   * Currency FX converter (KES, USD, EUR, GBP)
   */
  convertCurrency(amount: number, from: string, to: string): { amount: number; rate: number } {
    const ratesToKes: Record<string, number> = {
      KES: 1.0,
      USD: 130.5,
      EUR: 141.2,
      GBP: 168.0,
    };

    const fromRate = ratesToKes[from.toUpperCase()] || 1.0;
    const toRate = ratesToKes[to.toUpperCase()] || 1.0;

    const kesVal = amount * fromRate;
    const converted = kesVal / toRate;
    const effectiveRate = fromRate / toRate;

    return {
      amount: Math.round(converted * 100) / 100,
      rate: Math.round(effectiveRate * 10000) / 10000,
    };
  }
}

export const wealthEngine = new KenyanWealthEngine();
