import { query } from './db';
import { etimsService, EtimsInvoiceResult } from './etims';

export interface DashboardAccount {
  id: number | string;
  user_id?: number;
  institution_code: string;
  institution_name: string;
  account_number_mask: string;
  account_type: string;
  currency: string;
  balance: number;
  available_balance?: number;
  is_active?: boolean;
  last_synced_at?: string;
  created_at: string;
}

export interface DashboardTransaction {
  id: number | string;
  account_id?: number | string;
  source_rail: 'MPESA_DARAJA' | 'EQUITY_JENGA' | 'KCB_BUNI' | 'COOP_BANK' | 'STANCHART' | 'PAYPAL';
  rail_reference: string; // e.g. M-Pesa receipt RJL792XYZ1 or Bank Ref
  amount: number;
  currency: string;
  date: string;
  merchant_or_party: string;
  category: string;
  payment_channel?: string;
  type: 'debit' | 'credit';
  balance_after?: number;
  etims_status?: 'UNFISCALIZED' | 'FISCALIZED' | 'EXEMPT';
  etims_invoice_id?: string;
  vat_amount?: number;
  is_reconciled?: boolean;
}

export interface MpesaCallbackRecord {
  id: string;
  callback_type: string;
  trans_id: string;
  phone_number: string;
  amount: number;
  received_at: string;
  raw_payload: any;
}

export interface CategoryExpense {
  category: string;
  icon: string;
  color: string;
  total_amount: number;
  transaction_count: number;
}

export const KENYAN_CATEGORIES: Record<string, { icon: string; color: string }> = {
  'Food & Supermarkets': { icon: '🛒', color: '#F87171' },
  'Utilities & Electricity (KPLC)': { icon: '💡', color: '#FBBF24' },
  'Mobile Airtime & Fibre (Safaricom)': { icon: '📶', color: '#34D399' },
  'Transportation & Fuel (Rubis/Total)': { icon: '⛽', color: '#60A5FA' },
  'Shopping & Retail': { icon: '🛍️', color: '#A78BFA' },
  'Healthcare & Pharmacy': { icon: '🏥', color: '#F472B6' },
  'Rent & Housing': { icon: '🏠', color: '#818CF8' },
  'Business Sales & Inflows': { icon: '💰', color: '#10B981' },
  'Tax & KRA Payments': { icon: '🏛️', color: '#EF4444' },
  'Investments & MMF Deposits': { icon: '📈', color: '#059669' },
  'Transfers & Pesalink': { icon: '🔄', color: '#9CA3AF' },
  'Other Expenses': { icon: '📦', color: '#6B7280' },
};

// Initial Kenyan Accounts (Native Rails)
let accountsStore: DashboardAccount[] = [
  {
    id: 1,
    user_id: 1,
    institution_code: 'SAFARICOM',
    institution_name: 'M-Pesa Business Till & Paybill',
    account_number_mask: 'Till: 889021',
    account_type: 'M-Pesa Paybill / Till',
    currency: 'KES',
    balance: 145800.0,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 2,
    user_id: 1,
    institution_code: 'EQUITY',
    institution_name: 'Equity Bank Kenya (Jenga Connect)',
    account_number_mask: '****4819',
    account_type: 'Current / Checking',
    currency: 'KES',
    balance: 485200.0,
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 3,
    user_id: 1,
    institution_code: 'KCB',
    institution_name: 'KCB Bank Kenya (Buni API)',
    account_number_mask: '****9102',
    account_type: 'Savings',
    currency: 'KES',
    balance: 210000.0,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: 4,
    user_id: 1,
    institution_code: 'COOP',
    institution_name: 'Co-operative Bank of Kenya',
    account_number_mask: '****3321',
    account_type: 'Current / Checking',
    currency: 'KES',
    balance: 95400.0,
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 5,
    user_id: 1,
    institution_code: 'SCB',
    institution_name: 'Standard Chartered Kenya',
    account_number_mask: '****6541',
    account_type: 'Current / Checking',
    currency: 'KES',
    balance: 320000.0,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 6,
    user_id: 1,
    institution_code: 'PAYPAL',
    institution_name: 'PayPal USD Remittance Wallet',
    account_number_mask: 'wanjiku@paypal.com',
    account_type: 'PayPal Balance',
    currency: 'USD',
    balance: 2450.0,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

// Initial realistic Kenyan transactions
let transactionsStore: DashboardTransaction[] = [
  {
    id: 1,
    account_id: 1,
    source_rail: 'MPESA_DARAJA',
    rail_reference: 'RJL902KL11',
    amount: 18500.0,
    currency: 'KES',
    date: new Date().toISOString().split('T')[0],
    merchant_or_party: 'Safaricom M-Pesa C2B Inflow (Karanja M.)',
    category: 'Business Sales & Inflows',
    payment_channel: 'C2B Paybill',
    type: 'credit',
    balance_after: 145800.0,
    etims_status: 'FISCALIZED',
    etims_invoice_id: 'INV-17180291',
    vat_amount: 2551.72,
    is_reconciled: true,
  },
  {
    id: 2,
    account_id: 1,
    source_rail: 'MPESA_DARAJA',
    rail_reference: 'RJL482PQ99',
    amount: 3500.0,
    currency: 'KES',
    date: new Date().toISOString().split('T')[0],
    merchant_or_party: 'Kenya Power (KPLC Prepaid Tokens)',
    category: 'Utilities & Electricity (KPLC)',
    payment_channel: 'Paybill 888880',
    type: 'debit',
    balance_after: 127300.0,
    etims_status: 'EXEMPT',
    vat_amount: 0.0,
    is_reconciled: true,
  },
  {
    id: 3,
    account_id: 2,
    source_rail: 'EQUITY_JENGA',
    rail_reference: 'EQT78192033',
    amount: 12500.0,
    currency: 'KES',
    date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    merchant_or_party: 'Naivas Supermarket Junction Mall',
    category: 'Food & Supermarkets',
    payment_channel: 'EazzyPay Card',
    type: 'debit',
    balance_after: 485200.0,
    etims_status: 'FISCALIZED',
    etims_invoice_id: 'INV-17180155',
    vat_amount: 1724.14,
    is_reconciled: true,
  },
  {
    id: 4,
    account_id: 1,
    source_rail: 'MPESA_DARAJA',
    rail_reference: 'RJK38291AA',
    amount: 6000.0,
    currency: 'KES',
    date: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    merchant_or_party: 'Safaricom Home Fibre 50Mbps',
    category: 'Mobile Airtime & Fibre (Safaricom)',
    payment_channel: 'Buy Goods 150150',
    type: 'debit',
    balance_after: 130800.0,
    etims_status: 'FISCALIZED',
    etims_invoice_id: 'INV-17179920',
    vat_amount: 827.59,
    is_reconciled: true,
  },
  {
    id: 5,
    account_id: 2,
    source_rail: 'EQUITY_JENGA',
    rail_reference: 'EQT90123844',
    amount: 6500.0,
    currency: 'KES',
    date: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    merchant_or_party: 'Rubis Energy Kilimani - Fuel V-Power',
    category: 'Transportation & Fuel (Rubis/Total)',
    payment_channel: 'Pesalink Direct',
    type: 'debit',
    balance_after: 497700.0,
    etims_status: 'FISCALIZED',
    vat_amount: 896.55,
    is_reconciled: true,
  },
  {
    id: 6,
    account_id: 6,
    source_rail: 'PAYPAL',
    rail_reference: 'PP-CAP-99128',
    amount: 1200.0,
    currency: 'USD',
    date: new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0],
    merchant_or_party: 'Upwork Global Client Remittance',
    category: 'Business Sales & Inflows',
    payment_channel: 'PayPal USD Inward',
    type: 'credit',
    balance_after: 2450.0,
    etims_status: 'UNFISCALIZED',
    vat_amount: 0.0,
    is_reconciled: false,
  },
];

// Callbacks & eTIMS invoices log
let mpesaCallbacksStore: MpesaCallbackRecord[] = [];
let etimsInvoicesStore: EtimsInvoiceResult[] = [
  {
    invoiceId: 'INV-17180291',
    cuin: 'KRA-VSCU-2026-902148',
    fiscalReceiptNumber: 'FRN-78192033',
    invoiceDate: new Date().toISOString(),
    taxableAmount: 15948.28,
    vatAmount: 2551.72,
    grandTotal: 18500.0,
    qrCodeUrl: 'https://etims.kra.go.ke/verify?pin=P051234567Z&cuin=KRA-VSCU-2026-902148&receipt=FRN-78192033&amt=18500',
    vscuStatus: 'FISCALIZED',
    signature: 'VkNDVS1LUmEtU0lHTkFUVVJFLTIwMjY=',
  },
];

export async function getAccounts(): Promise<DashboardAccount[]> {
  try {
    const res = await query('SELECT * FROM financial_accounts WHERE is_active = true ORDER BY id ASC');
    if (res && res.rows && res.rows.length > 0) {
      return res.rows;
    }
  } catch (err) {
    // Return memory store
  }
  return accountsStore;
}

export async function getTransactions(params?: {
  limit?: number;
  category?: string;
  search?: string;
  rail?: string;
}): Promise<DashboardTransaction[]> {
  let list = [...transactionsStore];

  if (params?.rail) {
    list = list.filter((t) => t.source_rail === params.rail);
  }
  if (params?.category) {
    list = list.filter((t) => t.category.toLowerCase() === params.category!.toLowerCase());
  }
  if (params?.search) {
    const s = params.search.toLowerCase();
    list = list.filter(
      (t) =>
        t.merchant_or_party.toLowerCase().includes(s) ||
        t.rail_reference.toLowerCase().includes(s) ||
        t.category.toLowerCase().includes(s)
    );
  }

  list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (params?.limit) {
    list = list.slice(0, params.limit);
  }

  return list;
}

export async function getExpensesByCategory(): Promise<CategoryExpense[]> {
  const txs = await getTransactions();
  const debitTxs = txs.filter((t) => t.type === 'debit');

  const totals: Record<string, { total: number; count: number }> = {};

  for (const t of debitTxs) {
    if (!totals[t.category]) {
      totals[t.category] = { total: 0, count: 0 };
    }
    // Convert USD to KES if necessary for charting
    const amountKes = t.currency === 'USD' ? t.amount * 130.5 : t.amount;
    totals[t.category].total += amountKes;
    totals[t.category].count += 1;
  }

  return Object.keys(totals).map((cat) => ({
    category: cat,
    icon: KENYAN_CATEGORIES[cat]?.icon || '📦',
    color: KENYAN_CATEGORIES[cat]?.color || '#6B7280',
    total_amount: Math.round(totals[cat].total * 100) / 100,
    transaction_count: totals[cat].count,
  }));
}

export async function recordMpesaCallback(payload: any, type: string) {
  const transId = payload.TransID || payload.Body?.stkCallback?.CallbackMetadata?.Item?.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value || `RJL${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const amount = Number(payload.TransAmount || payload.Body?.stkCallback?.CallbackMetadata?.Item?.find((i: any) => i.Name === 'Amount')?.Value || 0);
  const phone = String(payload.MSISDN || payload.Body?.stkCallback?.CallbackMetadata?.Item?.find((i: any) => i.Name === 'PhoneNumber')?.Value || '2547XXXXXXXX');

  const rec: MpesaCallbackRecord = {
    id: 'cb_' + Date.now(),
    callback_type: type,
    trans_id: transId,
    phone_number: phone,
    amount,
    received_at: new Date().toISOString(),
    raw_payload: payload,
  };

  mpesaCallbacksStore.unshift(rec);

  // If amount > 0, automatically log as a live transaction!
  if (amount > 0) {
    const isCredit = type.includes('C2B') || payload.Body?.stkCallback?.ResultCode === 0;
    const newTx: DashboardTransaction = {
      id: Date.now(),
      account_id: 1, // M-Pesa account
      source_rail: 'MPESA_DARAJA',
      rail_reference: transId,
      amount,
      currency: 'KES',
      date: new Date().toISOString().split('T')[0],
      merchant_or_party: `M-Pesa Direct (${phone})`,
      category: isCredit ? 'Business Sales & Inflows' : 'Transfers & Pesalink',
      payment_channel: type,
      type: isCredit ? 'credit' : 'debit',
      etims_status: 'UNFISCALIZED',
      vat_amount: Math.round((amount - amount / 1.16) * 100) / 100,
      is_reconciled: false,
    };
    transactionsStore.unshift(newTx);

    // Update M-Pesa account balance
    const mpesaAcc = accountsStore.find((a) => a.institution_code === 'SAFARICOM');
    if (mpesaAcc) {
      mpesaAcc.balance += isCredit ? amount : -amount;
    }
  }

  return rec;
}

export async function getMpesaCallbacks(): Promise<MpesaCallbackRecord[]> {
  return mpesaCallbacksStore;
}

export async function getEtimsInvoices(): Promise<EtimsInvoiceResult[]> {
  return etimsInvoicesStore;
}

export async function addEtimsInvoice(invoice: EtimsInvoiceResult, transactionId?: number | string) {
  etimsInvoicesStore.unshift(invoice);
  if (transactionId) {
    const tx = transactionsStore.find((t) => t.id === transactionId || t.rail_reference === transactionId);
    if (tx) {
      tx.etims_status = 'FISCALIZED';
      tx.etims_invoice_id = invoice.invoiceId;
      tx.vat_amount = invoice.vatAmount;
      tx.is_reconciled = true;
    }
  }
  return invoice;
}
