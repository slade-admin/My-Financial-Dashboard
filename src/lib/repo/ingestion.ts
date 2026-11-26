import { createHash } from 'node:crypto';
import { parseSms } from '../sms';
import { bankAccountMatches } from '../account-identifiers';
import { BadRequestError, ConflictError } from '../errors';
import { importTransaction } from '../import-ledger';
import { getAccounts, addAccount } from './accounts';
import { addTransaction } from './transactions';
import { createImportPreview } from './imports';
import type { PersonalAccount } from './types';

export async function ingestSms(userId: number, options: {
  message: string; sender?: string; accountId?: string | number; counterpartAccountId?: string | number; receivedAt?: string;
}) {
  if ([...options.message.matchAll(/\b[A-Z0-9]{10}\s+Confirmed\b/gi)].length > 1) {
    throw new BadRequestError('Send one SMS at a time. Use Imports to preview and confirm a batch.');
  }
  const parsed = parseSms(options.message, options.sender);
  if (!parsed) return null;
  let accounts = await getAccounts(userId);
  let primary: PersonalAccount | undefined;
  if (options.accountId) {
    primary = accounts.find((a) => String(a.id) === String(options.accountId));
    if (!primary) throw new BadRequestError('Account not found for user.');
  }
  const pending = async (reason: string) => {
    const key = createHash('sha256').update(`${parsed.sourceFingerprint}|${options.receivedAt || ''}`).digest('hex');
    const batch = await createImportPreview(userId, {
      rawText: options.message, format: 'sms', accountId: primary?.id,
      counterpartAccountId: options.counterpartAccountId, sourceName: 'Forwarded SMS needing review',
      allowUnmapped: true, ingestKey: key, reviewReason: reason,
    });
    return { needsReview: true as const, batchId: batch.id, seenCount: batch.seenCount, message: reason };
  };
  if (parsed.source === 'bank') {
    const matches = accounts.filter((a) => bankAccountMatches(a, parsed.accountIdentifier, parsed.institution));
    if (!primary) {
      if (matches.length !== 1) return pending('Bank identifier is missing or does not uniquely match a configured account. Review under Imports.');
      primary = matches[0];
    } else if (!bankAccountMatches(primary, parsed.accountIdentifier, parsed.institution)) {
      return pending('The alert identifier cannot be verified against the explicitly assigned bank account. Verify the mapping.');
    }
  } else if (!primary) {
    const named = accounts.filter((a) => a.account_type === 'mobile_money' && /m-?pesa/i.test(a.name));
    const matches = named.length ? named : accounts.filter((a) => a.account_type === 'mobile_money');
    if (matches.length > 1) return pending('Several mobile wallets match. Select the correct wallet under Imports.');
    primary = matches[0];
  }
  if (parsed.dateInferred || parsed.ambiguousIdentity || parsed.ambiguousAmount || parsed.classificationNeedsReview || parsed.kind === 'fuliza' ||
      (parsed.source === 'mpesa' && parsed.type === 'expense' && parsed.cost === undefined)) {
    return pending('Date, event identity, amount, fee or income/transfer/loan treatment needs review. No balances were changed.');
  }
  if (!primary) {
    const identity = createHash('sha256').update(`default-ingest-wallet:${userId}`).digest('hex').slice(0, 32);
    primary = await addAccount(userId, {
      name: 'M-PESA', institution: 'Safaricom', account_type: 'mobile_money',
      currency: 'KES', balance: 0, is_asset: true,
      request_id: identity.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
    });
    accounts = [...accounts, primary];
  }
  try {
    const result = await addTransaction(userId, importTransaction(accounts, primary, parsed,
      parsed.source === 'bank' ? 'bank_sms' : 'mpesa_sms', options.counterpartAccountId));
    return {
      needsReview: false as const, duplicate: result.isDuplicate, transaction: result.transaction,
      account: { id: primary.id, name: primary.name },
      parsed: {
        source: parsed.source, kind: parsed.kind, syntheticReference: parsed.syntheticReference,
        institution: parsed.institution, counterparty: parsed.counterparty, balance: parsed.balance, cost: parsed.cost,
      },
    };
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ConflictError) return pending(error.message);
    throw error;
  }
}
