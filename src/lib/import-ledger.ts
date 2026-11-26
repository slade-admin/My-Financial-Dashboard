import { BadRequestError } from './errors';
import { ledgerDate, moneyInput } from './money';
import type { PersonalAccount, PersonalTransaction } from './repo/types';

interface Movement {
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  description: string;
  category: string;
  reference?: string;
  kind?: string;
  cost?: number;
  sourceFingerprint?: string;
}

export function importTransaction(
  accounts: PersonalAccount[],
  primary: PersonalAccount,
  movement: Movement,
  source: PersonalTransaction['import_source'],
  counterpartId?: string | number,
): Omit<PersonalTransaction, 'id'> {
  ledgerDate(movement.date);
  const amount = moneyInput(movement.amount, 'Amount');
  const fee = moneyInput(movement.cost ?? 0, 'Fee', { allowZero: true });
  if (movement.kind === 'fuliza') {
    throw new BadRequestError('Loan draws require manual loan tracking; borrowed principal is not an expense.');
  }
  const cash = movement.kind === 'withdraw' || movement.kind === 'deposit';
  if (cash && primary.account_type === 'cash') {
    throw new BadRequestError('Select the bank or M-Pesa wallet as the primary import account, not the cash wallet.');
  }
  const transfer = cash || movement.type === 'transfer' || movement.kind === 'mshwari';
  let counterpart: PersonalAccount | undefined;
  if (transfer) {
    let candidates = accounts.filter((a) => String(a.id) !== String(primary.id));
    if (cash) candidates = candidates.filter((a) => a.account_type === 'cash');
    if (counterpartId) candidates = candidates.filter((a) => String(a.id) === String(counterpartId));
    else if (!cash) candidates = candidates.filter((a) =>
      /kcb/i.test(movement.description)
        ? /kcb.*m.?pesa/i.test(`${a.name} ${a.institution}`)
        : /m.?shwari/i.test(`${a.name} ${a.institution}`),
    );
    if (candidates.length !== 1) {
      throw new BadRequestError('Select one matching counterpart wallet for cash or savings transfers. Create a cash wallet if needed.');
    }
    counterpart = candidates[0];
  }
  const deposit = (movement.kind === 'deposit' ||
    (movement.kind === 'mshwari' && movement.type === 'income')) && counterpart;
  return {
    account_id: deposit ? deposit.id : primary.id,
    transfer_account_id: transfer ? (deposit ? primary.id : counterpart!.id) : undefined,
    type: transfer ? 'transfer' : movement.type,
    amount, currency: 'KES', date: movement.date,
    description: movement.description, category: transfer ? 'Transfers & Remittance' : movement.category,
    reference: movement.reference, import_source: source,
    fee_amount: fee, fee_account_id: fee ? primary.id : undefined,
    source_fingerprint: movement.sourceFingerprint,
  };
}
