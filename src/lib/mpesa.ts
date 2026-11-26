/**
 * src/lib/mpesa.ts
 *
 * M-Pesa SMS parsing.
 *
 * Why this module exists: the original parser in store.ts matched recipients
 * with `([^on]+)` — a negated character class meaning "any run of characters
 * that are not 'o' and not 'n'", not the word "on". Any counterparty whose
 * name contains o or n failed to parse, which is most Kenyan names (Njeri,
 * Onyango, Wanjiku, John...). Verified before the rewrite: "PETER KAMAU"
 * parsed, "JANE WANJIKU" and "ALI HASSAN" did not. Withdrawals, airtime
 * purchases, Fuliza and M-Shwari had no patterns at all.
 *
 * Each message yields at most one transaction. Callers dedupe on `reference`,
 * which is M-Pesa's receipt number and unique per transaction — the
 * transactions table enforces UNIQUE (user_id, reference).
 */
import { todayLocal } from './repo/types';

export type MpesaKind =
  | 'send'
  | 'receive'
  | 'paybill'
  | 'buygoods'
  | 'withdraw'
  | 'deposit'
  | 'airtime'
  | 'fuliza'
  | 'mshwari';

export interface ParsedMpesaMessage {
  reference: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  description: string;
  category: string;
  kind: MpesaKind;
  /** Other party, when the message names one. */
  counterparty?: string;
  /** "New M-PESA balance is Ksh..." when present. */
  balance?: number;
  /** "Transaction cost, Ksh..." when present. Charged on top of `amount`. */
  cost?: number;
  dateInferred?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** "1,234.50" → 1234.5 */
function money(raw: string): number {
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(raw)) return NaN;
  return Number(raw.replace(/,/g, ''));
}

/** M-Pesa prints d/m/yy. Convert to ISO yyyy-mm-dd. */
export function mpesaDateToIso(raw: string, today = new Date()): string {
  if (!raw.trim()) return todayLocal(today);
  const parts = raw.split('/');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    if (year.length === 4 && +month >= 1 && +month <= 12 && +day >= 1 && +day <= 31) {
      const iso = `${year}-${month}-${day}`;
      const parsed = new Date(`${iso}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
    }
  }
  return '';
}

/** Trailing "New M-PESA balance is Ksh2,340.00." */
function extractBalance(text: string): number | undefined {
  const m = text.match(/balance\s+is\s+Ksh\s?([\d,]+\.?\d*)/i);
  return m ? money(m[1]) : undefined;
}

/** Trailing "Transaction cost, Ksh13.00." */
function extractCost(text: string): number | undefined {
  const m = text.match(/Transaction\s+cost[,:]?\s*Ksh\s?([\d,]+\.?\d*)/i);
  return m ? money(m[1]) : undefined;
}

/** Strip a trailing phone number from a counterparty name. */
function cleanName(raw: string): string {
  return raw
    .replace(/\b(?:\+?254|0)7\d{8}\b/g, '')   // Kenyan mobile numbers
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.,-]+$/, '')
    .trim();
}

export function categorizeKenyanDescription(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('kplc') || d.includes('power') || d.includes('water') || d.includes('tokens'))
    return 'Utilities & Water (KPLC)';
  if (d.includes('safaricom') || d.includes('airtime') || d.includes('fibre') || d.includes('bundles') || d.includes('zuku'))
    return 'Airtime & Internet (Safaricom)';
  if (d.includes('naivas') || d.includes('quickmart') || d.includes('carrefour') || d.includes('groceries') || d.includes('food'))
    return 'Food & Groceries';
  if (d.includes('total') || d.includes('rubis') || d.includes('shell') || d.includes('matatu') || d.includes('uber') || d.includes('bolt') || d.includes('petrol'))
    return 'Transport & Fuel (Matatu/Petrol)';
  if (d.includes('rent') || d.includes('landlord') || d.includes('housing')) return 'Rent & Housing';
  if (d.includes('hospital') || d.includes('pharmacy') || d.includes('chemist') || d.includes('doctor'))
    return 'Healthcare & Pharmacy';
  if (d.includes('school') || d.includes('fees') || d.includes('university') || d.includes('college'))
    return 'Education & School Fees';
  if (d.includes('salary') || d.includes('payroll') || d.includes('wages')) return 'Salary & Primary Income';
  if (d.includes('mmf') || d.includes('cic') || d.includes('sanlam') || d.includes('shares') || d.includes('cdsc'))
    return 'Savings & MMF Deposit';
  if (d.includes('fuliza') || d.includes('m-shwari loan') || d.includes('kcb mpesa') || d.includes('loan'))
    return 'Loan & Fuliza Repayment';
  return 'Shopping & Essentials';
}

// ─── Patterns ───────────────────────────────────────────────────────────────
//
// Shared fragments. `REF` is M-Pesa's 10-character receipt number. Amount
// capture tolerates an optional space after "Ksh" and thousands separators.
// Dates are captured as d/m/yy; everything after is ignored by each pattern.

const REF = String.raw`([A-Z0-9]{10})`;
const AMT = String.raw`Ksh\s?([\d,]+\.?\d*)`;
const DATE = String.raw`(\d{1,2}\/\d{1,2}\/\d{2,4})`;

/**
 * Order matters: pay bill ("sent to X for account Y") must be tested before
 * the plain send pattern, since the plain pattern would otherwise swallow
 * "X for account Y" as the recipient name.
 */
const PATTERNS: Array<{
  kind: MpesaKind;
  re: RegExp;
  build: (m: RegExpMatchArray, today: Date) => Omit<ParsedMpesaMessage, 'balance' | 'cost'>;
}> = [
  {
    // "Ksh1,000.00 sent to KPLC PREPAID for account 12345 on 12/3/24 at ..."
    kind: 'paybill',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+sent\\s+to\\s+(.+?)\\s+for\\s+account\\s+(\\S+)\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => {
      const biller = cleanName(m[3]);
      return {
        reference: m[1],
        amount: money(m[2]),
        type: 'expense',
        date: mpesaDateToIso(m[5], today),
        description: `Paid ${biller} (acct ${m[4]})`,
        category: categorizeKenyanDescription(biller),
        kind: 'paybill',
        counterparty: biller,
      };
    },
  },
  {
    // "Ksh500.00 sent to JANE WANJIKU 0712345678 on 12/3/24 at ..."
    kind: 'send',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+sent\\s+to\\s+(.+?)\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => {
      const who = cleanName(m[3]);
      return {
        reference: m[1],
        amount: money(m[2]),
        type: 'expense',
        date: mpesaDateToIso(m[4], today),
        description: `Sent to ${who}`,
        category: categorizeKenyanDescription(who),
        kind: 'send',
        counterparty: who,
      };
    },
  },
  {
    // "You have received Ksh90,000.00 from ACME LTD 0700111222 on 28/3/24 ..."
    kind: 'receive',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*You\\s+have\\s+received\\s+${AMT}\\s+from\\s+(.+?)\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => {
      const who = cleanName(m[3]);
      return {
        reference: m[1],
        amount: money(m[2]),
        type: 'income',
        date: mpesaDateToIso(m[4], today),
        description: `Received from ${who}`,
        category: categorizeKenyanDescription(who) === 'Shopping & Essentials'
          ? 'Salary & Primary Income'
          : categorizeKenyanDescription(who),
        kind: 'receive',
        counterparty: who,
      };
    },
  },
  {
    // "Ksh2,500.00 paid to CARREFOUR KENYA. on 12/3/24 at ..."
    // The merchant name is terminated by a period in buy-goods messages.
    kind: 'buygoods',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+paid\\s+to\\s+(.+?)\\.\\s*(?:on\\s+${DATE})?`, 'i'),
    build: (m, today) => {
      const merchant = cleanName(m[3]);
      return {
        reference: m[1],
        amount: money(m[2]),
        type: 'expense',
        date: m[4] ? mpesaDateToIso(m[4], today) : todayLocal(today),
        description: `Paid to ${merchant}`,
        category: categorizeKenyanDescription(merchant),
        kind: 'buygoods',
        counterparty: merchant,
      };
    },
  },
  {
    // Real withdrawals read: "Confirmed.on 12/3/24 at 1:00 PM Withdraw Ksh1,000.00 from 123456 - AGENT"
    // and some older ones: "Ksh1,000.00 withdrawn from AGENT on 12/3/24".
    kind: 'withdraw',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*on\\s+${DATE}[^]*?Withdraw\\s+${AMT}\\s+from\\s+(.+?)(?:\\s+New\\s+M-PESA|\\.|$)`, 'i'),
    build: (m, today) => {
      const agent = cleanName(m[4]);
      return {
        reference: m[1],
        amount: money(m[3]),
        type: 'expense',
        date: mpesaDateToIso(m[2], today),
        description: `Cash withdrawal${agent ? ` at ${agent}` : ''}`,
        category: 'Shopping & Essentials',
        kind: 'withdraw',
        counterparty: agent || undefined,
      };
    },
  },
  {
    kind: 'withdraw',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+withdrawn\\s+from\\s+(.+?)\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => {
      const agent = cleanName(m[3]);
      return {
        reference: m[1],
        amount: money(m[2]),
        type: 'expense',
        date: mpesaDateToIso(m[4], today),
        description: `Cash withdrawal${agent ? ` at ${agent}` : ''}`,
        category: 'Shopping & Essentials',
        kind: 'withdraw',
        counterparty: agent || undefined,
      };
    },
  },
  {
    // "You bought Ksh100.00 of airtime on 12/3/24 at ..."
    // also "...of airtime for 0712345678 on ..."
    kind: 'airtime',
    re: new RegExp(`${REF}\\s+[Cc]onfirmed\\.?\\s*You\\s+bought\\s+${AMT}\\s+of\\s+airtime(?:\\s+for\\s+(\\S+))?\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => ({
      reference: m[1],
      amount: money(m[2]),
      type: 'expense',
      date: mpesaDateToIso(m[4], today),
      description: m[3] ? `Airtime for ${cleanName(m[3])}` : 'Airtime purchase',
      category: 'Airtime & Internet (Safaricom)',
      kind: 'airtime',
    }),
  },
  {
    // "Ksh5,000.00 deposited to your M-PESA account on 12/3/24"  (cash-in)
    kind: 'deposit',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+deposited\\s+to\\s+your\\s+M-?PESA\\s+account\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => ({
      reference: m[1],
      amount: money(m[2]),
      type: 'income',
      date: mpesaDateToIso(m[3], today),
      description: 'Cash deposit to M-PESA',
      category: 'Shopping & Essentials',
      kind: 'deposit',
    }),
  },
  {
    // "Ksh1,000.00 transferred from M-PESA to M-Shwari account on 12/3/24"
    kind: 'mshwari',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+transferred\\s+from\\s+M-?PESA\\s+to\\s+(M-?Shwari|KCB\\s+M-?PESA)\\s+account\\s+on\\s+${DATE}`, 'i'),
    build: (m, today) => ({
      reference: m[1],
      amount: money(m[2]),
      // Moving your own money between wallets is not spending.
      type: 'transfer',
      date: mpesaDateToIso(m[4], today),
      description: `Transfer to ${m[3]}`,
      category: 'Savings & MMF Deposit',
      kind: 'mshwari',
    }),
  },
  {
    kind: 'receive',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*You\\s+have\\s+received\\s+${AMT}\\s+from\\s+(.+?)(?:\\.(?:\\s|$)|\\s+(?:New\\s+M-?PESA|Transaction\\s+cost)|$)`, 'i'),
    build: (m, today) => {
      const who = cleanName(m[3]);
      const category = categorizeKenyanDescription(who);
      return {
        reference: m[1], amount: money(m[2]), type: 'income', date: todayLocal(today),
        description: `Received from ${who}`, category: category === 'Shopping & Essentials' ? 'Salary & Primary Income' : category,
        kind: 'receive', counterparty: who,
      };
    },
  },
  {
    kind: 'send',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*${AMT}\\s+sent\\s+to\\s+(.+?)(?:\\.(?:\\s|$)|\\s+(?:New\\s+M-?PESA|Transaction\\s+cost)|$)`, 'i'),
    build: (m, today) => {
      const who = cleanName(m[3]);
      return {
        reference: m[1], amount: money(m[2]), type: 'expense', date: todayLocal(today),
        description: `Sent to ${who}`, category: categorizeKenyanDescription(who), kind: 'send', counterparty: who,
      };
    },
  },
  {
    // "Fuliza M-PESA amount is Ksh500.00. Interest charged Ksh5.00..."
    kind: 'fuliza',
    re: new RegExp(`${REF}\\s+Confirmed\\.?\\s*Fuliza\\s+M-?PESA\\s+amount\\s+is\\s+${AMT}`, 'i'),
    build: (m, today) => ({
      reference: m[1],
      amount: money(m[2]),
      type: 'expense',
      date: todayLocal(today),
      description: 'Fuliza overdraft drawn',
      category: 'Loan & Fuliza Repayment',
      kind: 'fuliza',
    }),
  },
];

/**
 * Parse a single M-Pesa SMS. Returns null if no pattern matches, so callers
 * can report unrecognised formats instead of silently dropping them.
 */
export function parseMpesaSms(
  text: string,
  today: Date = new Date(),
): ParsedMpesaMessage | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  for (const { re, build } of PATTERNS) {
    const m = clean.match(re);
    if (m) {
      const base = build(m, today);
      const statedDate = clean.match(/\bon\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\b/i)?.[1];
      const date = statedDate ? mpesaDateToIso(statedDate, today) : base.date;
      if (!Number.isFinite(base.amount) || base.amount <= 0 || !date) return null;
      const balance = extractBalance(clean);
      const cost = extractCost(clean);
      if (cost !== undefined && !Number.isFinite(cost)) return null;
      return {
        ...base,
        date,
        reference: base.reference.toUpperCase(),
        dateInferred: !statedDate,
        ...(balance !== undefined ? { balance } : {}),
        ...(cost !== undefined ? { cost } : {}),
      };
    }
  }
  return null;
}

export function classifyMpesaDetails(details: string, type: 'income' | 'expense'): { kind: MpesaKind; category: string } {
  const fee = /(?:fee|charge|cost)\b/i.test(details);
  const kind: MpesaKind = fee ? 'send'
    : /fuliza|loan/i.test(details) ? 'fuliza'
    : /transfer|deposit|withdraw/i.test(details) && /m.?shwari|kcb.*m.?pesa/i.test(details) ? 'mshwari'
    : /withdraw|cash\s*out/i.test(details) ? 'withdraw'
    : /deposit|cash\s*in/i.test(details) ? 'deposit'
    : type === 'income' ? 'receive' : 'send';

  return { kind, category: fee ? 'Transaction Fees' : categorizeKenyanDescription(details) };
}
