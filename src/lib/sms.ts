/**
 * src/lib/sms.ts
 *
 * Single entry point for inbound SMS: decides whether a message is M-Pesa or
 * a bank alert and returns one normalised shape.
 *
 * The phone-side forwarder relays everything from a watched set of senders,
 * so the server cannot assume which kind arrived. M-Pesa is tried first
 * because its format is strict and unambiguous (a 10-character receipt code
 * followed by "Confirmed"), which makes a false positive very unlikely. The
 * bank parser is looser by necessity, so it only ever sees what M-Pesa
 * declined.
 */
import { parseMpesaSms } from './mpesa';
import { parseBankSms } from './bank-sms';

export type SmsSource = 'mpesa' | 'bank';

export interface ParsedSms {
  source: SmsSource;
  reference: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  description: string;
  category: string;
  /** Institution for bank alerts; undefined for M-Pesa. */
  institution?: string;
  counterparty?: string;
  balance?: number;
  cost?: number;
  /** Narrower classification: M-Pesa kind, or bank credit/debit. */
  kind: string;
  /** True when the reference was derived from content, not supplied. */
  syntheticReference: boolean;
}

/**
 * Parse an inbound SMS from any supported source.
 *
 * `sender` (e.g. "MPESA", "Equity") is an optional hint. It is NOT trusted to
 * decide the parser, because forwarders report sender IDs inconsistently and
 * a wrong hint would silently misroute the message; content always decides.
 */
export function parseSms(text: string, sender?: string): ParsedSms | null {
  const mpesa = parseMpesaSms(text);
  if (mpesa) {
    return {
      source: 'mpesa',
      reference: mpesa.reference,
      amount: mpesa.amount,
      type: mpesa.type,
      date: mpesa.date,
      description: mpesa.description,
      category: mpesa.category,
      counterparty: mpesa.counterparty,
      balance: mpesa.balance,
      cost: mpesa.cost,
      kind: mpesa.kind,
      syntheticReference: false,
    };
  }

  const bank = parseBankSms(text);
  if (bank) {
    return {
      source: 'bank',
      reference: bank.reference,
      amount: bank.amount,
      type: bank.type,
      date: bank.date,
      description: bank.description,
      category: bank.category,
      institution: bank.institution ?? (sender ? sender.trim() : undefined),
      balance: bank.balance,
      kind: bank.direction,
      syntheticReference: bank.syntheticReference,
    };
  }

  return null;
}
