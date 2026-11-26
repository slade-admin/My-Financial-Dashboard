'use client';

import { useState } from 'react';
import { apiJson, jsonRequest } from '@/lib/api-client';
import { ledgerEffects } from '@/lib/ledger';
import type {
  PersonalAccount, PersonalAsset, PersonalBudget, PersonalLiability, PersonalSavingsGoal, PersonalTransaction,
} from '@/lib/repo/types';

export type EditableSelection =
  | { kind: 'account'; record: PersonalAccount }
  | { kind: 'transaction'; record: PersonalTransaction }
  | { kind: 'asset'; record: PersonalAsset }
  | { kind: 'liability'; record: PersonalLiability }
  | { kind: 'goal'; record: PersonalSavingsGoal }
  | { kind: 'budget'; record: PersonalBudget };

type Field = { name: string; label: string; type?: string; required?: boolean; max?: number; options?: string[][] };
const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white';
const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);

export default function RecordEditor({ selection, accounts, categories, onClose, onSaved, onReload }: {
  selection: EditableSelection;
  accounts: PersonalAccount[];
  categories: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { kind, record } = selection;
  const values = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? '')]));
  const creating = kind === 'budget' && record.id === 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transactionType, setTransactionType] = useState(values.type || 'expense');
  const [reversing, setReversing] = useState(kind === 'transaction' && values.type === 'adjustment');
  const [retiring, setRetiring] = useState(false);
  const options = (names: string[]) => names.map((name) => [name, name.replaceAll('_', ' ')]);
  const categoryOptions = options([...new Set([...categories, values.category].filter(Boolean))]);
  const accountOptions = accounts.map((account) => [String(account.id), account.name]);
  let fields: Field[] = [];
  if (kind === 'account') fields = [
    { name: 'name', label: 'Account name', required: true, max: 255 },
    { name: 'institution', label: 'Institution', max: 255 },
    { name: 'account_type', label: 'Account type', options: options(['mobile_money', 'bank_savings', 'bank_checking', 'sacco', 'cash', 'investment']) },
    { name: 'account_identifier', label: 'Bank SMS identifier (at least four visible trailing digits)', max: 40 },
  ];
  if (kind === 'transaction') fields = [
    { name: 'account_id', label: 'Source account', options: accountOptions },
    { name: 'type', label: 'Transaction type', options: options(['income', 'expense', 'transfer']) },
    ...(transactionType === 'transfer' ? [{ name: 'transfer_account_id', label: 'Destination account', options: [['', 'Choose destination'], ...accountOptions], required: true }] : []),
    { name: 'amount', label: 'Principal amount (KES)', type: 'number', required: true },
    { name: 'fee_amount', label: 'Linked fee (KES)', type: 'number' },
    { name: 'fee_account_id', label: 'Fee charged to', options: [['', 'Source account'], ...accountOptions], required: false },
    { name: 'date', label: 'Transaction date', type: 'date', required: true },
    { name: 'description', label: 'Description / merchant', required: true, max: 500 },
    { name: 'category', label: 'Category', options: categoryOptions },
    { name: 'reference', label: 'Receipt / reference', max: 100 },
  ];
  if (kind === 'asset') fields = [
    { name: 'name', label: 'Asset name', required: true, max: 255 },
    { name: 'category', label: 'Asset category', options: options(['real_estate', 'vehicle', 'investments', 'land', 'livestock', 'valuables', 'other']) },
    { name: 'estimated_value', label: 'Estimated value (KES)', type: 'number', required: true },
    { name: 'notes', label: 'Notes', max: 5000 },
  ];
  if (kind === 'liability') fields = [
    { name: 'name', label: 'Liability name', required: true, max: 255 },
    { name: 'creditor', label: 'Creditor', max: 255 },
    { name: 'category', label: 'Debt category', options: options(['personal_loan', 'mortgage', 'car_loan', 'helb', 'sacco_loan', 'mobile_loan', 'credit_card', 'other']) },
    { name: 'principal_amount', label: 'Original principal (KES)', type: 'number', required: true },
    { name: 'outstanding_balance', label: 'Outstanding balance (KES)', type: 'number', required: true },
    { name: 'interest_rate', label: 'Annual interest rate (%)', type: 'number' },
    { name: 'monthly_payment', label: 'Monthly payment (KES)', type: 'number' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'notes', label: 'Notes', max: 5000 },
  ];
  if (kind === 'goal') fields = [
    { name: 'name', label: 'Goal name', required: true, max: 255 },
    { name: 'target_amount', label: 'Target amount (KES)', type: 'number', required: true },
    { name: 'target_date', label: 'Target date', type: 'date' },
  ];
  if (kind === 'budget') fields = [
    { name: 'category', label: 'Budget category', options: categoryOptions },
    { name: 'monthly_limit', label: 'Recurring monthly limit (KES)', type: 'number', required: true },
  ];
  const endpoints = { account: '/api/transactions', transaction: '/api/transactions',
    asset: '/api/assets-liabilities', liability: '/api/assets-liabilities', goal: '/api/goals', budget: '/api/budgets' };
  const reversalEffects = selection.kind === 'transaction' ? [...ledgerEffects(selection.record, true)] : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="record-editor-title">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-[#111726] p-6">
        <div className="flex items-center justify-between">
          <h2 id="record-editor-title" className="font-bold">{reversing ? 'Reverse transaction' : retiring ? 'Retire budget' : `${creating ? 'Create' : 'Edit'} ${kind}`}</h2>
          <button type="button" disabled={busy} onClick={onClose} className="text-sm text-slate-400">Cancel</button>
        </div>
        {kind === 'account' && <p className="text-xs text-slate-400">
          Balances come from the ledger. Use Reconcile to statement balance to correct them; opening balances are not overwritten.
        </p>}
        {kind === 'liability' && <p className="text-xs text-slate-400">
          Updating a debt balance does not debit a wallet. Record any actual repayment separately, avoiding duplicate entries.
        </p>}
        {kind === 'goal' && <p className="text-xs text-slate-400">Use Earmark / Release for saved amounts. Editing a target never moves money.</p>}
        {kind === 'budget' && <p className="text-xs text-slate-400">This recurring limit applies when viewing any month; historical limit snapshots are not inferred.</p>}
        {error && <div role="alert" className="rounded-lg border border-rose-800 p-3 text-sm text-rose-300">
          {error}
          <button type="button" disabled={busy} onClick={() => { void onReload(); }} className="mt-2 block underline">Discard form and reload latest data</button>
        </div>}
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = Object.fromEntries(new FormData(event.currentTarget).entries());
          const body: Record<string, unknown> = {
            ...form, id: record.id, version: record.version, currency: 'KES',
          };
          if (kind === 'account') { body.type = 'account'; body.is_asset = form.is_asset === 'on'; }
          if (kind === 'asset' || kind === 'liability') body.kind = kind;
          if (kind === 'liability') {
            body.interest_rate = form.interest_rate || null;
            body.monthly_payment = form.monthly_payment || null;
          }
          if (kind === 'transaction') {
            body.action = 'edit';
            body.fee_amount = form.fee_amount || 0;
            body.fee_account_id = form.fee_account_id || form.account_id;
            body.transfer_account_id = form.type === 'transfer' ? form.transfer_account_id : null;
          }
          if (reversing || retiring) body.confirm = true;
          setBusy(true); setError('');
          try {
            await apiJson(endpoints[kind], jsonRequest(reversing || retiring ? 'DELETE' : creating ? 'POST' : 'PATCH', body));
            await onSaved();
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this record.'); }
          finally { setBusy(false); }
        }}>
          <fieldset disabled={busy} className="space-y-3">
            {reversing ? (
              <div className="space-y-2 text-sm text-slate-300">
                <p>{values.description}: {money(Number(values.amount))}</p>
                <p>The transaction and its linked fee will be retained as voided history, excluded from reports, with these balance changes:</p>
                {reversalEffects.map(([id, delta]) => <p key={id}>{accounts.find((a) => Number(a.id) === id)?.name}: {money(-delta)}</p>)}
                <label className="flex items-center gap-2"><input type="checkbox" required />I reviewed these balance changes.</label>
              </div>
            ) : retiring ? <p className="text-sm text-slate-300">Remove {values.category} from active budgets? Transactions and change history are preserved.</p> : (
              <>
                {fields.map((field) => <label key={field.name} className="block text-xs text-slate-300">
                  {field.label}
                  {field.options ? (
                    <select name={field.name} defaultValue={values[field.name] || field.options[0]?.[0]} required={field.required ?? true} className={inputClass}
                      onChange={field.name === 'type' ? (e) => setTransactionType(e.target.value) : undefined}>
                      {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  ) : <input name={field.name} defaultValue={values[field.name] || ''} type={field.type || 'text'}
                    required={field.required} maxLength={field.max} step={field.type === 'number' ? '0.01' : undefined}
                    min={field.type === 'number' ? (['amount', 'target_amount'].includes(field.name) ? '0.01' : '0') : undefined}
                    className={inputClass} />}
                </label>)}
                {kind === 'account' && <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="is_asset" defaultChecked={values.is_asset === 'true'} />Include account in net worth
                </label>}
              </>
            )}
            {!creating && <label className="block text-xs text-slate-300">Reason for this change (retained in history)
              <input name="reason" required maxLength={500} className={inputClass} />
            </label>}
            <button type="submit" className={`w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${reversing || retiring ? 'bg-rose-700' : 'bg-emerald-600'}`}>
              {busy ? 'Saving...' : reversing ? 'Confirm reversal' : retiring ? 'Confirm retirement' : creating ? 'Create budget' : 'Save changes'}
            </button>
            {kind === 'transaction' && values.type !== 'adjustment' && <button type="button" className="text-xs text-rose-300 underline" onClick={() => { setReversing(!reversing); setError(''); }}>
              {reversing ? 'Back to editing' : 'Reverse this transaction and linked fee'}
            </button>}
            {kind === 'budget' && !creating && <button type="button" className="text-xs text-rose-300 underline" onClick={() => { setRetiring(!retiring); setError(''); }}>
              {retiring ? 'Back to editing' : 'Retire this budget'}
            </button>}
          </fieldset>
        </form>
      </div>
    </div>
  );
}
