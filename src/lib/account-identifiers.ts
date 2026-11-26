import type { PersonalAccount } from './repo/types';

export function normalizeAccountIdentifier(value: string): string | undefined {
  const clean = value.replace(/[\s-]/g, '');
  if (!/^[\d*x]{4,40}$/i.test(clean)) return undefined;
  return clean.match(/\d{4,}$/)?.[0];
}

function institutionKey(value: string): string {
  const key = value.toLowerCase().replace(/bank|limited|ltd|kenya/g, '').replace(/[^a-z]/g, '');
  if (key.startsWith('coop')) return 'coop';
  if (key === 'commercial' || key === 'kcb') return 'kcb';
  if (key === 'diamondtrust' || key === 'dtb') return 'dtb';
  if (key === 'stanchart' || key === 'standardchartered') return 'standardchartered';
  return key;
}

export function bankAccountMatches(
  account: Pick<PersonalAccount, 'account_type' | 'account_identifier' | 'institution'>,
  identifier: string | undefined,
  institution?: string,
): boolean {
  if (!['bank_checking', 'bank_savings', 'sacco'].includes(account.account_type)) return false;
  const stored = account.account_identifier && normalizeAccountIdentifier(account.account_identifier);
  const received = identifier && normalizeAccountIdentifier(identifier);
  if (!stored || !received || !(stored.endsWith(received) || received.endsWith(stored))) return false;
  const bank = institutionKey(account.institution || '');
  const receivedBank = institutionKey(institution || '');
  return !bank || !receivedBank || bank === receivedBank;
}
