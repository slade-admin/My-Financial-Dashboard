/**
 * src/lib/bank-sms.ts
 *
 * Kenyan bank SMS alert parsing (Equity, KCB, Co-op, Absa, NCBA, Stanbic,
 * DTB, Family, I&M, Stanchart).
 *
 * Why this exists: Kevin's salary arrives in a bank account, not M-Pesa, and
 * he then moves part of it to M-Pesa. Parsing only M-Pesa means the inflow
 * that funds everything else is invisible. Bank SMS alerts are the cheap way
 * in -- they arrive on the same phone as M-Pesa messages and the same
 * forwarder can relay them, so this needs no PDF parsing and no bank API.
 *
 * Bank formats are far less consistent than M-Pesa's. Safaricom emits a small
 * fixed set of templates; each bank words its alerts differently and changes
 * them without notice. So rather than one rigid pattern per bank, this works
 * off the shape nearly all of them share:
 *
 *     <institution?> ... <account?> ... credited|debited|received|sent
 *     ... KES <amount> ... on <date> ... [Ref <ref>] [balance KES <bal>]
 *
 * Direction is decided by keyword, amount and date by position-independent
 * search. That tolerates re-wording far better than full-message templates.
 *
 * Deliberately conservative: a message must carry a currency-tagged amount
 * AND a direction keyword to parse at all, so marketing texts, OTPs and
 * balance-only notifications return null rather than inventing transactions.
 */
import { toMoney, todayLocal } from './repo/types';
import { createHash } from 'node:crypto';
import { categorizeKenyanDescription } from './mpesa';

export type BankDirection = 'credit' | 'debit';

export interface ParsedBankMessage {
  /** Bank-supplied reference when present, else a deterministic synthetic one. */
  reference: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  description: string;
  category: string;
  institution?: string;
  /** Masked/partial account number as printed in the alert. */
  account?: string;
  balance?: number;
  direction: BankDirection;
  /** True when `reference` was synthesised because the alert carried none. */
  syntheticReference: boolean;
  dateInferred: boolean;
  ambiguousIdentity: boolean;
  ambiguousAmount: boolean;
  classificationNeedsReview: boolean;
}

/** Known Kenyan banks, matched case-insensitively anywhere in the message. */
const BANKS: Array<[RegExp, string]> = [
  [/\bequity\b/i, 'Equity Bank'],
  [/\bkcb\b/i, 'KCB Bank'],
  [/\bco-?op(erative)?\b/i, 'Co-operative Bank'],
  [/\babsa\b/i, 'Absa Bank'],
  [/\bncba\b/i, 'NCBA Bank'],
  [/\bstanbic\b/i, 'Stanbic Bank'],
  [/\bdtb\b|\bdiamond trust\b/i, 'DTB'],
  [/\bfamily bank\b/i, 'Family Bank'],
  [/\bI&M\b/i, 'I&M Bank'],
  [/\bstandard chartered\b|\bstanchart\b/i, 'Standard Chartered'],
];

/** Credit (money in) vs debit (money out). Order matters: longest first. */
const CREDIT_WORDS = /\b(credited|deposited|received|has been credited|credit)\b/i;
const DEBIT_WORDS = /\b(debited|withdrawn|sent|paid|purchase|debit|charged|transferred to)\b/i;

const AMOUNT = /\b(?:KES|Kshs?|KSh)\.?\s?([\d,]+(?:\.\d{1,2})?)(?![\d,]|\.\d)/gi;
/** dd/mm/yyyy, dd-mm-yyyy or dd.mm.yy */
const DATE_RE = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/;
/** "Ref ABC123", "Ref: ABC123", "Reference ABC123", "TxnID ABC123" */
const REF_RE = /\b(?:ref(?:erence)?|txn\s*id|transaction\s*id|receipt)\b[:.\s]*([A-Z0-9][A-Z0-9-]{3,})/i;
/** "A/C 1234567890", "account 12****90", "Acc no. 1234" */
const ACCOUNT_RE = /\b(?:a\/c|acc(?:ount)?(?:\s*no\.?)?)\b[:.\s]*((?:\d|\*|x){4,})/i;
const BALANCE_RE =
  /\b(?:available\s+balance|bal(?:ance)?)\b[^0-9]{0,20}(?:KES|Kshs?|KSh)?\.?\s?([\d,]+(?:\.\d{1,2})?)/i;

/** Messages that mention money but are not transactions. */
const NOT_A_TRANSACTION = [
  /\bOTP\b|\bone[- ]time (pin|password)\b|\bverification code\b/i,
  /\bloan (offer|limit)\b|\bpre-?approved\b|\bqualify for\b/i,
  /\bdear customer,? (we|your statement|kindly note)\b/i,
  /\bpromo(tion)?\b|\bwin\b|\boffer ends\b|\bdiscount\b/i,
  /\bfailed\b|\bdeclined\b|\bunsuccessful\b|\breversed\b/i,
];

function money(raw: string): number {
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(raw)) return NaN;
  return toMoney(parseFloat(raw.replace(/,/g, '')));
}

function isoDate(m: RegExpMatchArray | null, today: Date): string {
  if (!m) return localIso(today);
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  let year = m[3];
  if (year.length === 2) year = '20' + year;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
}

/** Local calendar date, not UTC — see the date off-by-one note in lib/db.ts. */
function localIso(d: Date): string {
  return todayLocal(d);
}

/**
 * Build a stable reference for alerts that carry none.
 *
 * Deduplication depends on UNIQUE (user_id, reference), so a random value
 * would let a re-delivered SMS insert twice. This derives the reference from
 * the message's own content, meaning the same alert always yields the same
 * reference and re-delivery is still idempotent.
 */
function syntheticRef(message: string): string {
  return `BANK${createHash('sha256').update(message.toLowerCase()).digest('hex')}`;
}

/**
 * Parse a bank SMS alert. Returns null when the text is not a transaction
 * alert, so callers can report it instead of silently dropping it.
 */
export function parseBankSms(
  text: string,
  today: Date = new Date(),
): ParsedBankMessage | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  if (NOT_A_TRANSACTION.some((re) => re.test(clean))) return null;

  // Direction. Check debit first: "credited" and "debited" can both appear
  // when a message mentions a balance, but the operative verb comes first.
  const creditIdx = clean.search(CREDIT_WORDS);
  const debitIdx = clean.search(DEBIT_WORDS);
  let direction: BankDirection;
  if (creditIdx === -1 && debitIdx === -1) return null;
  else if (creditIdx === -1) direction = 'debit';
  else if (debitIdx === -1) direction = 'credit';
  else direction = creditIdx < debitIdx ? 'credit' : 'debit';

  const operative = direction === 'credit' ? creditIdx : debitIdx;
  const candidates = [...clean.matchAll(AMOUNT)].filter((match) => {
    const prefix = clean.slice(Math.max(0, match.index - 35), match.index);
    return !/\b(?:balance|bal|cost|fee|charge)[^.!?]{0,30}$/i.test(prefix);
  }).sort((a, b) => Math.abs(a.index - operative) - Math.abs(b.index - operative));
  if (!candidates.length) return null;
  const amount = money(candidates[0][1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const institution = BANKS.find(([re]) => re.test(clean))?.[1];
  const iso = clean.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const dateMatch = clean.match(DATE_RE);
  const date = iso || isoDate(dateMatch, today);
  if (!date) return null;
  const account = clean.match(ACCOUNT_RE)?.[1];
  const balanceMatch = clean.match(BALANCE_RE);
  const balance = balanceMatch ? money(balanceMatch[1]) : undefined;

  const refMatch = clean.match(REF_RE);
  const reference = refMatch
    ? refMatch[1].toUpperCase()
    : syntheticRef(clean);

  const who = institution ?? 'Bank';
  const description =
    direction === 'credit'
      ? `${who} credit${account ? ` to a/c ${account}` : ''}`
      : `${who} debit${account ? ` from a/c ${account}` : ''}`;

  // A large credit to a bank account is overwhelmingly salary for this app's
  // users; anything else falls back to keyword categorisation of the text.
  const keyword = categorizeKenyanDescription(clean);
  const category =
    direction === 'credit'
      ? keyword === 'Shopping & Essentials'
        ? 'Salary & Primary Income'
        : keyword
      : keyword;

  return {
    reference,
    amount,
    type: direction === 'credit' ? 'income' : 'expense',
    date,
    description,
    category,
    institution,
    account,
    balance,
    direction,
    syntheticReference: !refMatch,
    dateInferred: !iso && !dateMatch,
    ambiguousIdentity: !refMatch,
    ambiguousAmount: candidates.length > 1,
    classificationNeedsReview:
      /\b(?:transfer|transferred|loan|refund|atm|cash|withdrawn|fee|cost|charge)s?\b/i.test(clean) ||
      (direction === 'credit'
        ? !/\b(?:salary|wages|interest|dividend|pension)\b/i.test(clean)
        : !/\b(?:purchase|card payment|paid to|payment to)\b/i.test(clean)),
  };
}
