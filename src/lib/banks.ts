/**
 * Kenyan Direct Banking API Gateway & Open Banking Connectors
 * Unifies:
 * - Equity Bank (Jenga API v3 / Finserve)
 * - KCB Bank (Buni Open Banking API)
 * - Co-operative Bank of Kenya (Developer Portal Open Banking)
 * - Standard Chartered Kenya (Straight2Bank / SC Open Banking)
 * - Pesalink (IPMC real-time interbank settlement)
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
  status: 'connected' | 'syncing' | 'error';
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
   * Returns list of supported Kenyan banks and their open banking capabilities
   */
  getSupportedBanks() {
    return [
      {
        code: 'EQUITY_KE',
        name: 'Equity Bank Kenya',
        apiPortal: 'Jenga API (Finserve Africa)',
        capabilities: ['Account Balance', 'Mini-Statements', 'Pesalink Transfers', 'EazzyPay'],
        icon: '🏦',
        color: '#A32A29', // Equity Maroon
      },
      {
        code: 'KCB_KE',
        name: 'KCB Bank Kenya',
        apiPortal: 'KCB Buni Open Banking',
        capabilities: ['Balance Inquiry', 'Statement Pull', 'Pesalink Direct', 'Vooma Integration'],
        icon: '🏢',
        color: '#008751', // KCB Green
      },
      {
        code: 'COOP_KE',
        name: 'Co-operative Bank of Kenya',
        apiPortal: 'Co-op Open Banking Portal',
        capabilities: ['Account Inquiry', 'MCo-op Cash Sync', 'Pesalink Rails', 'Internal Transfer'],
        icon: '🏪',
        color: '#006633', // Co-op Green
      },
      {
        code: 'SCB_KE',
        name: 'Standard Chartered Bank Kenya',
        apiPortal: 'Straight2Bank / SC Open Banking API',
        capabilities: ['Institutional Balance', 'Real-time Statements', 'RTGS / Pesalink', 'FX Trade'],
        icon: '🌐',
        color: '#0072CE', // StanChart Blue
      },
    ];
  }

  /**
   * Connect or initiate OAuth consent for a bank account
   */
  async initiateBankConnect(bankCode: KenyanBankIdentifier, accountNumber: string) {
    // In production, this redirects to the respective Bank's OAuth2 Consent Screen (e.g. Equity Jenga Auth or KCB Buni Consent)
    const consentId = `consent_${bankCode.toLowerCase()}_${Date.now()}`;
    return {
      success: true,
      bankCode,
      consentId,
      authUrl: `https://auth.bankgateway.co.ke/oauth/authorize?bank=${bankCode}&consent_id=${consentId}`,
      message: `Direct banking authorization initialized for ${bankCode}`,
    };
  }

  /**
   * Pulls real-time balances & mini-statements from the respective bank API
   */
  async syncBankData(bankCode: KenyanBankIdentifier, accountMask: string): Promise<{
    summary: BankAccountSummary;
    transactions: BankTransactionItem[];
  }> {
    const bankDetails = this.getSupportedBanks().find((b) => b.code === bankCode);
    const bankName = bankDetails?.name || bankCode;

    // Simulated real-time responses reflecting actual Kenyan banking formats
    const mockData: Record<KenyanBankIdentifier, { balance: number; txs: BankTransactionItem[] }> = {
      EQUITY_KE: {
        balance: 485200.0,
        txs: [
          {
            reference: 'EQT' + Math.floor(10000000 + Math.random() * 90000000),
            bankCode: 'EQUITY_KE',
            accountNumberMask: accountMask,
            date: new Date().toISOString().split('T')[0],
            narrative: 'PESALINK INWARD: SAFARICOM M-PESA FLOAT',
            amount: 50000.0,
            type: 'credit',
            category: 'Transfers & Pesalink',
            balanceAfter: 485200.0,
          },
          {
            reference: 'EQT' + Math.floor(10000000 + Math.random() * 90000000),
            bankCode: 'EQUITY_KE',
            accountNumberMask: accountMask,
            date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
            narrative: 'EAZZYPAY: RUBIS ENERGY KILIMANI FUEL',
            amount: 5400.0,
            type: 'debit',
            category: 'Transportation & Fuel (Rubis/Total)',
            balanceAfter: 435200.0,
          },
        ],
      },
      KCB_KE: {
        balance: 210000.0,
        txs: [
          {
            reference: 'KCB' + Math.floor(10000000 + Math.random() * 90000000),
            bankCode: 'KCB_KE',
            accountNumberMask: accountMask,
            date: new Date().toISOString().split('T')[0],
            narrative: 'KCB BUNI: SALARY ADVANCE CLEARANCE',
            amount: 75000.0,
            type: 'credit',
            category: 'Business Sales & Inflows',
            balanceAfter: 210000.0,
          },
        ],
      },
      COOP_KE: {
        balance: 95400.0,
        txs: [
          {
            reference: 'COP' + Math.floor(10000000 + Math.random() * 90000000),
            bankCode: 'COOP_KE',
            accountNumberMask: accountMask,
            date: new Date().toISOString().split('T')[0],
            narrative: 'MCO-OP CASH TRANSFER TO MPESA 0712***',
            amount: 15000.0,
            type: 'debit',
            category: 'Transfers & Pesalink',
            balanceAfter: 95400.0,
          },
        ],
      },
      SCB_KE: {
        balance: 320000.0,
        txs: [
          {
            reference: 'SCB' + Math.floor(10000000 + Math.random() * 90000000),
            bankCode: 'SCB_KE',
            accountNumberMask: accountMask,
            date: new Date().toISOString().split('T')[0],
            narrative: 'S2B RTGS INWARD: CONSULTING RETAINER USD/KES',
            amount: 180000.0,
            type: 'credit',
            category: 'Business Sales & Inflows',
            balanceAfter: 320000.0,
          },
        ],
      },
    };

    const target = mockData[bankCode] || { balance: 100000, txs: [] };

    return {
      summary: {
        bankCode,
        bankName,
        accountNumberMask: accountMask,
        accountType: 'Current / Checking',
        currency: 'KES',
        availableBalance: target.balance,
        actualBalance: target.balance,
        status: 'connected',
        lastSynced: new Date().toISOString(),
      },
      transactions: target.txs,
    };
  }
}

export const kenyanBankGateway = new KenyanBankGateway();
