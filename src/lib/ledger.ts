import type { PersonalTransaction } from './repo/types';

type Movement = Pick<PersonalTransaction, 'account_id' | 'amount' | 'type' | 'transfer_account_id' | 'fee_amount' | 'fee_account_id'>;

export function ledgerEffects(tx: Movement, includeFee = false): Map<number, number> {
  const cents = new Map<number, number>();
  const add = (id: string | number, amount: number) =>
    cents.set(Number(id), (cents.get(Number(id)) ?? 0) + Math.round(amount * 100));
  add(tx.account_id, tx.type === 'income' || tx.type === 'adjustment' ? tx.amount
    : tx.type === 'transfer' && !tx.transfer_account_id ? 0 : -tx.amount);
  if (tx.type === 'transfer' && tx.transfer_account_id) add(tx.transfer_account_id, tx.amount);
  // Persisted fees have their own expense rows; only draft/posting inputs include the parent fee.
  if (includeFee && tx.fee_amount) add(tx.fee_account_id ?? tx.account_id, -tx.fee_amount);
  return new Map([...cents].map(([id, value]) => [id, value / 100]));
}
