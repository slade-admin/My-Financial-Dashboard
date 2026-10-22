/**
 * Kenyan Direct Banking API Gateway — DEMO / PROTOTYPE
 *
 * IMPORTANT: These integrations are NOT live. All data returned is simulated.
 * Real integrations require signed developer agreements with each bank:
 * - Equity Bank: Jenga API (https://developer.jengaapi.io)
 * - KCB Bank: Buni API (https://buni.kcbgroup.com)
 * - Co-operative Bank: Developer Portal (https://developer.co-opbank.co.ke)
 * - Standard Chartered: Straight2Bank / Open Banking
 *
 * Status: DEMO — No real bank connections exist yet.
 */

export type KenyanBankIdentifier = 'EQUITY_KE' | 'KCB_KE' | 'COOP_KE' | 'SCB_KE';

export interface BankAccountSummary {
  bankCode: KenyanBankIdentifier;
  bankName: string;
  accountNumberMask: string;
  accountType: string;
  currency: string;
  availableBalance: number;
  actualBalance: number;
  status: 'demo' | 'connected' | 'syncing' | 'error';
  lastSynced: string;
}

export interface BankTransactionItem {
  reference: string;
  bankCode: KenyanBankIdentifier;
  accountNumberMask: string;
  date: string;
  narrative: string;
  amount: number;
  type: 'debit' | 'credit';
  category: string;
  balanceAfter: number;
}

export class KenyanBankGateway {
  /**
   * Returns list of supported Kenyan banks and their open banking capabilities.
   * Status is always 'demo' until real integrations are signed.
   */
  getSupportedBanks() {
    return [
      {
        code: 'EQUITY_KE' as KenyanBankIdentifier,
        name: 'Equity Bank Kenya',
        apiPortal: 'Jenga API (Finserve Africa)',
        capabilities: ['Account Balance', 'Mini-Statements', 'Pesalink Transfers', 'EazzyPay'],
        icon: '🏦',
        color: '#A32A29',
        status: 'demo' as const,
      },
      {
        code: 'KCB_KE' as KenyanBankIdentifier,
        name: 'KCB Bank Kenya',
        apiPortal: 'KCB Buni Open Banking',
        capabilities: ['Balance Inquiry', 'Statement Pull', 'Pesalink Direct', 'Vooma Integration'],
        icon: '🏢',
        color: '#008751',
        status: 'demo' as const,
      },
      {
        code: 'COOP_KE' as KenyanBankIdentifier,
        name: 'Co-operative Bank of Kenya',
        apiPortal: 'Co-op Open Banking Portal',
        capabilities: ['Account Inquiry', 'MCo-op Cash Sync', 'Pesalink Rails', 'Internal Transfer'],
        icon: '🏪',
        color: '#006633',
        status: 'demo' as const,
      },
      {
        code: 'SCB_KE' as KenyanBankIdentifier,
        name: 'Standard Chartered Bank Kenya',
        apiPortal: 'Straight2Bank / SC Open Banking API',
        capabilities: ['Institutional Balance', 'Real-time Statements', 'RTGS / Pesalink', 'FX Trade'],
        icon: '🌐',
        color: '#0072CE',
        status: 'demo' as const,
      },
    ];
  }

  /**
   * Placeholder for bank OAuth consent flow.
   * Returns demo status — no real bank authorization occurs.
   */
  async initiateBankConnect(bankCode: KenyanBankIdentifier, _accountNumber: string) {
    return {
      success: false,
      bankCode,
      status: 'demo' as const,
      message: `Bank integration for ${bankCode} is in demo mode. Real integration requires a signed developer agreement with the bank.`,
    };
  }

  /**
   * Returns DEMO data only. Not connected to any real bank API.
   * All balances and transactions are simulated fixtures.
   */
  async syncBankData(bankCode: KenyanBankIdentifier, accountMask: string): Promise<{
    summary: BankAccountSummary;
    transactions: BankTransactionItem[];
    isDemo: true;
  }> {
    const bankDetails = this.getSupportedBanks().find((b) => b.code === bankCode);
    const bankName = bankDetails?.name || bankCode;

    return {
      isDemo: true,
      summary: {
        bankCode,
        bankName,
        accountNumberMask: accountMask,
        accountType: 'Demo Account',
        currency: 'KES',
        availableBalance: 0,
        actualBalance: 0,
        status: 'demo',
        lastSynced: new Date().toISOString(),
      },
      transactions: [],
    };
  }
}

export const kenyanBankGateway = new KenyanBankGateway();
