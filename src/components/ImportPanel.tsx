'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ledgerEffects } from '@/lib/ledger';
import { apiFetch } from '@/lib/api-client';
import type {
  ImportBatch, ImportBatchListItem, ImportBalanceChange, ImportChoice,
  ImportFormat, ImportReviewTransaction,
} from '@/lib/import-types';

const endpoint = '/api/import/statement';
const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white disabled:opacity-50';
const buttonClass = 'rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40';
const money = (value: number) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', minimumFractionDigits: 2,
}).format(value);

async function api<T>(url: string, method = 'GET', body?: object): Promise<T> {
  const response = await apiFetch(url, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(300000),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ error: 'Could not read the import response. Refresh and retry.' }));
  if (!response.ok) throw new Error(data.error || 'Import request failed.');
  return data as T;
}

function choicesFor(batch: ImportBatch): ImportChoice[] {
  return batch.rows.map((row) => ({
    row: row.row, decision: row.status === 'ready' ? 'import' : row.status === 'duplicate' ? 'duplicate' : 'skip',
    reviewed: false, transaction: row.transaction ? { ...row.transaction } : undefined,
  }));
}

export default function ImportPanel({ accounts, categories, onChanged }: {
  accounts: Array<{ id: string | number; name: string; balance: number }>;
  categories: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('Pasted text');
  const [format, setFormat] = useState<ImportFormat>('auto');
  const [accountId, setAccountId] = useState('');
  const [counterpartId, setCounterpartId] = useState('');
  const [batch, setBatch] = useState<ImportBatch>();
  const [choices, setChoices] = useState<ImportChoice[]>([]);
  const [rowPage, setRowPage] = useState(0);
  const [history, setHistory] = useState<ImportBatchListItem[]>([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acceptExcluded, setAcceptExcluded] = useState(false);
  const [undo, setUndo] = useState<{ batch: ImportBatch; balances: ImportBalanceChange[] }>();
  const [acceptUndo, setAcceptUndo] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api<{ batches: ImportBatchListItem[]; hasMore: boolean }>(`${endpoint}?page=${historyPage}`);
      setHistory(data.batches);
      setHasMore(data.hasMore);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load import history.'); }
  }, [historyPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadHistory(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Import request failed.'); }
    finally { setBusy(false); }
  };
  const openBatch = (value: ImportBatch) => {
    setBatch(value); setChoices(choicesFor(value)); setRowPage(0); setAcceptExcluded(false);
  };
  const preview = () => run(async () => {
    const data = await api<{ batch: ImportBatch }>(endpoint, 'POST', {
      action: 'preview', rawText: text, format, accountId, counterpartAccountId: counterpartId || undefined, sourceName,
    });
    openBatch(data.batch); await loadHistory();
  });
  const patch = (row: number, values: Partial<ImportChoice>) =>
    setChoices((current) => current.map((choice) => choice.row === row ? { ...choice, ...values } : choice));
  const edit = (row: number, values: Partial<ImportReviewTransaction>) => {
    const choice = choices.find((c) => c.row === row);
    if (choice?.transaction) patch(row, { transaction: { ...choice.transaction, ...values } });
  };
  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const data = await api<{ batch: ImportBatch }>(endpoint, 'POST', {
        action: 'commit', batchId: batch!.id, rows: choices, confirm: true,
      });
      setBatch(data.batch); setText('');
      setNotice(`Imported ${data.batch.summary.imported}; duplicates ${data.batch.summary.duplicates}; rejected ${data.batch.summary.rejected}; skipped ${data.batch.summary.skipped}.`);
      await loadHistory(); await onChanged();
    });
  };
  const discard = () => run(async () => {
    await api(endpoint, 'DELETE', { action: 'discard', batchId: batch!.id });
    setBatch(undefined); setChoices([]); await loadHistory();
  });
  const projected = useMemo(() => {
    const totals = new Map<number, number>();
    for (const choice of choices.filter((c) => c.decision === 'import')) {
      const tx = choice.transaction;
      if (!tx || !tx.account_id || !Number.isFinite(Number(tx.amount)) || !Number.isFinite(Number(tx.fee_amount || 0))) continue;
      for (const [id, change] of ledgerEffects({ ...tx, amount: Number(tx.amount), fee_amount: Number(tx.fee_amount || 0) }, true)) {
        totals.set(id, (totals.get(id) || 0) + Math.round(change * 100));
      }
    }
    return [...totals].map(([id, cents]) => ({ name: accounts.find((a) => Number(a.id) === id)?.name || 'Unassigned', change: cents / 100 }));
  }, [accounts, choices]);
  const importing = choices.filter((c) => c.decision === 'import').length;
  const excluded = choices.filter((choice) => choice.decision === 'skip').length;
  const choicesByRow = new Map(choices.map((choice) => [choice.row, choice]));
  const editable = batch?.status === 'preview';
  const sourceLocked = busy || !!batch;
  const rows = batch?.rows.slice(rowPage * 50, (rowPage + 1) * 50) || [];

  const loadSample = (kind: 'sms' | 'csv') => {
    setSourceName(`Example ${kind.toUpperCase()} (fictional)`);
    setFormat(kind === 'csv' ? 'mpesa_csv' : 'sms');
    setText(kind === 'sms'
      ? 'QHL921KK89 Confirmed. Ksh3,200.00 sent to NAIVAS WESTLANDS on 22/10/26 at 11:45 AM. Transaction cost, Ksh13.00.\nQHK9902188 Confirmed. You have received Ksh25,000.00 from SAMPLE PERSON on 21/10/26.'
      : '"Receipt No.","Completion Time","Details","Transaction Status","Paid In","Withdrawn","Balance"\n"RJL902KL11","2026-10-21 09:30:12","Food, groceries","Completed","0.00","4,200.00","38,650.00"\n"RJL110AZ77","2026-10-19 14:00:00","Consulting income","Completed","50,000.00","0.00","44,850.00"');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Review & Import Statements</h2>
        <p className="text-xs text-slate-400">M-Pesa CSV and M-Pesa/bank SMS. Previewing never changes balances; saving requires confirmation.</p>
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
        {error} <button type="button" disabled={busy} className="ml-2 underline" onClick={() => { void loadHistory(); }}>Retry loading history</button>
      </div>}
      {notice && <div role="status" className="rounded-xl bg-emerald-950 p-3 text-xs text-emerald-200">{notice}</div>}
      <div className="rounded-2xl border border-slate-800 bg-[#111726] p-5 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-slate-300">
            Open local CSV / text file
            <input aria-label="Statement file" type="file" accept=".csv,.txt,text/csv,text/plain" disabled={sourceLocked}
              className="ml-2 text-xs" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void run(async () => {
                  if (file.size > 5 * 1024 * 1024) throw new Error('Use files up to 5 MB; split larger statements.');
                  setText(await file.text()); setSourceName(file.name); setFormat('auto');
                });
                event.target.value = '';
              }} />
          </label>
          <button type="button" className={buttonClass} disabled={sourceLocked} onClick={() => loadSample('sms')}>Load example SMS</button>
          <button type="button" className={buttonClass} disabled={sourceLocked} onClick={() => loadSample('csv')}>Load example CSV</button>
        </div>
        <label className="block text-xs text-slate-400">
          Statement or SMS text
          <textarea aria-label="Import source text" rows={7} value={text} disabled={sourceLocked}
            onChange={(e) => { setText(e.target.value); setSourceName('Pasted text'); }} className={`${inputClass} mt-1 font-mono`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">Format
            <select className={inputClass} disabled={sourceLocked} value={format} onChange={(e) => setFormat(e.target.value as ImportFormat)}>
              <option value="auto">Detect format</option><option value="mpesa_csv">M-Pesa CSV</option><option value="sms">M-Pesa / bank SMS</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Default account (required)
            <select aria-label="Default import account" className={inputClass} disabled={sourceLocked} value={accountId}
              onChange={(e) => { setAccountId(e.target.value); setCounterpartId(''); }}>
              <option value="">Choose account explicitly</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">Cash / savings counterpart
            <select className={inputClass} disabled={sourceLocked} value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}>
              <option value="">Only auto-match a unique wallet</option>
              {accounts.filter((a) => String(a.id) !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Examples only fill the editor. Bank identifiers determine suggested assignments; verify every account.
          Record each own-money transfer once as a paired transfer, and skip the other account&apos;s notification.
          Up to 5 MB / 10,000 rows per batch. PDF and bank-specific CSV formats are not supported.
        </p>
        {!accounts.length && <p className="text-xs text-amber-300">Create your wallets under Accounts &amp; Wallets first.</p>}
        <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          disabled={sourceLocked || !accountId || !text.trim()} onClick={() => { void preview(); }}>
          {busy ? 'Working...' : 'Preview without saving'}
        </button>
      </div>

      {batch && (
        <form onSubmit={confirm} className="rounded-2xl border border-slate-800 bg-[#111726] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white">{batch.sourceName} <span className="text-slate-400">({batch.status})</span></h3>
            <div className="flex gap-2">
              <button type="button" disabled={busy} className={buttonClass} onClick={() => { setBatch(undefined); setChoices([]); }}>Close without saving edits</button>
              {editable && <button type="button" disabled={busy} className={buttonClass} onClick={() => { void discard(); }}>Discard draft</button>}
            </div>
          </div>
          <p className="text-xs text-slate-300">
            {batch.summary.total} source rows; {batch.summary.ready} ready; {batch.summary.duplicates} duplicates;
            {' '}{batch.summary.review} need review; {batch.summary.conflicts} conflicts; {batch.summary.rejected} rejected.
            {batch.seenCount > 1 && ` Received ${batch.seenCount} times: verify retries versus distinct events.`}
          </p>
          {rows.map((row) => {
            const choice = choicesByRow.get(row.row)!;
            const tx = choice.transaction;
            const disabled = busy || !editable || choice.decision === 'skip';
            const selectAccount = (field: 'account_id' | 'transfer_account_id' | 'fee_account_id', label: string) => (
              <label className="text-xs text-slate-400">{label}
                <select className={inputClass} aria-label={`${label} row ${row.row}`} disabled={disabled}
                  required={editable && choice.decision !== 'skip'} value={tx?.[field] || ''}
                  onChange={(e) => edit(row.row, { [field]: e.target.value })}>
                  <option value="">Choose wallet</option>
                  {accounts.filter((a) => field === 'fee_account_id'
                    ? String(a.id) === String(tx?.account_id) || String(a.id) === String(tx?.transfer_account_id)
                    : field !== 'transfer_account_id' || String(a.id) !== String(tx?.account_id))
                    .map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            );
            return (
              <div key={row.row} className="rounded-xl border border-slate-700 p-3 space-y-3">
                <div className="flex flex-wrap justify-between gap-2 items-center">
                  <strong className="text-xs text-white">Row {row.row} / source line {row.line}: {row.outcome || row.status}</strong>
                  {tx && <select aria-label={`Decision row ${row.row}`} className={`${inputClass} max-w-48`} disabled={busy || !editable}
                    value={choice.decision} onChange={(e) => patch(row.row, { decision: e.target.value as ImportChoice['decision'] })}>
                    <option value="import">Import this event</option><option value="duplicate">Already recorded / duplicate</option><option value="skip">Skip this row</option>
                  </select>}
                </div>
                <details className="text-xs text-slate-400"><summary className="cursor-pointer">Original source</summary><pre className="mt-1 whitespace-pre-wrap break-words">{row.raw}</pre></details>
                {[...row.issues, ...row.warnings].map((message, index) => <p key={index} className="text-xs text-amber-300">{message}</p>)}
                {tx && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <label className="text-xs text-slate-400">Date
                    <input type="date" aria-label={`Date row ${row.row}`} className={inputClass} disabled={disabled} required value={tx.date}
                      onChange={(e) => edit(row.row, { date: e.target.value })} />
                  </label>
                  <label className="text-xs text-slate-400">Type
                    <select className={inputClass} disabled={disabled} value={tx.type} onChange={(e) => edit(row.row, {
                      type: e.target.value as ImportReviewTransaction['type'],
                      transfer_account_id: e.target.value === 'transfer' ? tx.transfer_account_id || '' : undefined,
                      fee_account_id: tx.account_id,
                    })}>
                      <option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Own transfer</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">Principal (KES)
                    <input type="number" min="0.01" step="0.01" className={inputClass} disabled={disabled} required value={tx.amount}
                      onChange={(e) => edit(row.row, { amount: e.target.value })} />
                  </label>
                  {selectAccount('account_id', 'Source / receiving account')}
                  {tx.type === 'transfer' && selectAccount('transfer_account_id', 'Destination account')}
                  <label className="text-xs text-slate-400">Fee (KES, additional)
                    <input type="number" min="0" step="0.01" className={inputClass} disabled={disabled} required value={tx.fee_amount ?? 0}
                      onChange={(e) => edit(row.row, { fee_amount: e.target.value })} />
                  </label>
                  {Number(tx.fee_amount) > 0 && selectAccount('fee_account_id', 'Fee account')}
                  <label className="text-xs text-slate-400">Category
                    <select className={inputClass} disabled={disabled} required value={tx.category}
                      onChange={(e) => edit(row.row, { category: e.target.value })}>
                      {[...new Set([...categories, tx.category])].map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400 col-span-2">Reference
                    <input aria-label={`Reference row ${row.row}`} className={inputClass} disabled={disabled} required maxLength={100} value={tx.reference || ''}
                      onChange={(e) => edit(row.row, { reference: e.target.value })} />
                    {editable && row.movement?.source === 'bank' && <button type="button" className="mt-1 text-emerald-400 hover:underline" disabled={disabled}
                      onClick={() => edit(row.row, { reference: `REVIEW-${crypto.randomUUID()}` })}>Use new reference only if this is a distinct event</button>}
                  </label>
                  <label className="text-xs text-slate-400 col-span-2">Description
                    <input className={inputClass} disabled={disabled} required maxLength={500} value={tx.description}
                      onChange={(e) => edit(row.row, { description: e.target.value })} />
                  </label>
                </div>}
                {editable && row.needsReview && tx && <label className="flex items-center gap-2 text-xs text-amber-200">
                  <input type="checkbox" checked={choice.reviewed} disabled={busy || choice.decision === 'skip'} required={choice.decision !== 'skip'}
                    onChange={(e) => patch(row.row, { reviewed: e.target.checked })} />
                  I verified this row&apos;s warnings, date, identity and wallet assignment.
                </label>}
              </div>
            );
          })}
          {batch.rows.length > 50 && <div className="flex items-center gap-3 text-xs text-slate-400">
            <button type="button" className={buttonClass} disabled={busy || rowPage === 0} onClick={() => setRowPage((p) => p - 1)}>Previous rows</button>
            Page {rowPage + 1} of {Math.ceil(batch.rows.length / 50)}
            <button type="button" className={buttonClass} disabled={busy || (rowPage + 1) * 50 >= batch.rows.length} onClick={() => setRowPage((p) => p + 1)}>Next rows</button>
          </div>}
          {editable && <>
            <div className="text-xs text-slate-300">
              <strong>Projected balance changes ({importing} selected events):</strong>
              {projected.map((effect) => <p key={effect.name}>{effect.name}: {money(effect.change)}</p>)}
            </div>
            {excluded > 0 && <label className="flex items-center gap-2 text-xs text-amber-200">
              <input type="checkbox" checked={acceptExcluded} onChange={(e) => setAcceptExcluded(e.target.checked)} required />
              I understand {excluded} skipped / rejected rows will not be added.
            </label>}
            <button type="submit" disabled={busy || (!importing && !choices.some((c) => c.decision === 'duplicate')) || (excluded > 0 && !acceptExcluded)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? 'Saving atomically...' : `Confirm reviewed import (${importing} selected)`}
            </button>
            <p className="text-xs text-slate-400">No partial batch is saved if a selected row fails. Retrying this confirmation cannot apply it twice.</p>
          </>}
        </form>
      )}

      <section className="rounded-2xl border border-slate-800 bg-[#111726] p-5 space-y-3">
        <div className="flex justify-between items-center"><h3 className="text-sm font-bold text-white">Import history &amp; pending SMS reviews</h3>
          <button className={buttonClass} disabled={busy} onClick={() => { void loadHistory(); }}>Refresh history</button>
        </div>
        {!history.length && <p className="text-xs text-slate-400">No imports yet. Pending previews do not affect your balances.</p>}
        {history.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-3 border-t border-slate-800 pt-3">
          <div className="text-xs text-slate-300">
            <strong>{item.sourceName}</strong> - {item.status}
            <p className="text-slate-400">{new Date(item.createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</p>
            <p>Imported {item.summary.imported}; duplicates {item.summary.duplicates}; rejected {item.summary.rejected}; skipped {item.summary.skipped}.</p>
            {item.seenCount > 1 && <p className="text-amber-300">Received {item.seenCount} times; verify retries versus distinct events.</p>}
          </div>
          <div className="flex items-start gap-2">
            <button className={buttonClass} disabled={busy || !!batch} onClick={() => { void run(async () => {
              const data = await api<{ batch: ImportBatch }>(`${endpoint}?id=${item.id}`); openBatch(data.batch);
            }); }}>{item.status === 'preview' ? 'Review draft' : 'View audit'}</button>
            {item.status === 'committed' && <button className={buttonClass} disabled={busy} onClick={() => { void run(async () => {
              const data = await api<{ batch: ImportBatch; balances: ImportBalanceChange[] }>(`${endpoint}?id=${item.id}&reversal=true`);
              setUndo(data); setAcceptUndo(false);
            }); }}>Preview undo</button>}
          </div>
        </div>)}
        <div className="flex gap-3 items-center text-xs text-slate-400">
          <button className={buttonClass} disabled={busy || !historyPage} onClick={() => setHistoryPage((p) => p - 1)}>Newer batches</button>
          Page {historyPage + 1}
          <button className={buttonClass} disabled={busy || !hasMore} onClick={() => setHistoryPage((p) => p + 1)}>Older batches</button>
        </div>
      </section>
      {undo && <div role="dialog" aria-modal="true" aria-labelledby="undo-import-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-[#111726] p-5 max-w-lg w-full space-y-4">
          <h3 id="undo-import-title" className="text-sm font-bold text-white">Undo {undo.batch.sourceName}?</h3>
          <p className="text-xs text-slate-300">Only entries actually created by this batch, including linked fees, are reversed. Existing duplicates and later transactions are kept. Audit records remain.</p>
          {undo.balances.map((balance) => <p key={balance.accountId} className="text-xs text-slate-300">
            {balance.accountName}: {money(balance.before)} to {money(balance.after)} ({money(balance.change)})
          </p>)}
          <label className="flex gap-2 text-xs text-amber-200">
            <input type="checkbox" checked={acceptUndo} onChange={(e) => setAcceptUndo(e.target.checked)} />
            I understand balances will change. Any later reconciliation may need to be done again.
          </label>
          <div className="flex gap-3">
            <button className={buttonClass} disabled={busy} onClick={() => setUndo(undefined)}>Cancel</button>
            <button disabled={busy || !acceptUndo} className="rounded-lg bg-rose-700 px-3 py-2 text-xs text-white disabled:opacity-40" onClick={() => { void run(async () => {
              const data = await api<{ batch: ImportBatch }>(endpoint, 'DELETE', { action: 'reverse', batchId: undo.batch.id, confirm: true });
              if (batch?.id === data.batch.id) setBatch(data.batch);
              setUndo(undefined); setNotice('Import reversed. Linked fees and wallet balances were corrected; audit history was retained.');
              await loadHistory(); await onChanged();
            }); }}>Confirm undo</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
