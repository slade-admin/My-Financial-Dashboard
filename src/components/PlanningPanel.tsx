'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson, jsonRequest } from '@/lib/api-client';
import { todayLocal, type GoalContribution, type PersonalBudget, type PersonalSavingsGoal } from '@/lib/repo/types';
import type { EditableSelection } from './RecordEditor';
import type { HistorySelection } from './HistoryDialog';

const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
const buttonClass = 'rounded-lg bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700 disabled:opacity-40';
const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white';

export default function PlanningPanel({ goals, onCreateGoal, onEdit, onHistory, onChanged }: {
  goals: PersonalSavingsGoal[];
  onCreateGoal: () => void;
  onEdit: (selection: EditableSelection) => void;
  onHistory: (selection: HistorySelection) => void;
  onChanged: () => Promise<void>;
}) {
  const [month, setMonth] = useState(() => todayLocal().slice(0, 7));
  const [budgets, setBudgets] = useState<PersonalBudget[]>([]);
  const [budgetError, setBudgetError] = useState('');
  const [loadingBudgets, setLoadingBudgets] = useState(true);
  const [activity, setActivity] = useState<PersonalSavingsGoal>();
  const loadBudgets = useCallback(async (signal?: AbortSignal) => {
    setLoadingBudgets(true); setBudgetError('');
    try {
      const data = await apiJson<{ budgets: PersonalBudget[] }>(`/api/budgets?month=${encodeURIComponent(month)}`, { signal });
      if (!signal?.aborted) setBudgets(data.budgets);
    } catch (reason) {
      if (!signal?.aborted) setBudgetError(reason instanceof Error ? reason.message : 'Could not load budgets.');
    } finally { if (!signal?.aborted) setLoadingBudgets(false); }
  }, [month]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadBudgets(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadBudgets, goals]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Savings Goals & Monthly Budgets</h2>
        <button type="button" className={buttonClass} onClick={onCreateGoal}>+ New savings goal</button>
      </div>
      <p className="text-xs text-slate-400">Goals earmark existing savings only. Contributions and releases do not move money or increase net worth. Record actual wallet movements as transfers.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {goals.length === 0 && <p className="text-sm text-slate-400">No savings goals yet.</p>}
        {goals.map((goal) => {
          const percent = Math.min(100, goal.current_amount / goal.target_amount * 100);
          return (
            <article key={goal.id} className="space-y-3 rounded-2xl border border-slate-800 bg-[#111726] p-5">
              <h3 className="font-semibold">{goal.name}</h3>
              <p className="text-xs text-slate-400">Target: {money(goal.target_amount)}{goal.target_date && ` by ${goal.target_date}`}</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
              <p className="text-sm text-emerald-300">Earmarked: {money(goal.current_amount)} ({percent.toFixed(0)}%)</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass} onClick={() => setActivity(goal)}>Earmark / Release & history</button>
                <button type="button" className={buttonClass} onClick={() => onEdit({ kind: 'goal', record: goal })}>Edit</button>
                <button type="button" className={buttonClass} onClick={() => onHistory({ kind: 'goal', id: goal.id, name: goal.name })}>Change history</button>
              </div>
            </article>
          );
        })}
      </div>
      <section className="space-y-4 rounded-2xl border border-slate-800 bg-[#111726] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">Monthly category budgets</h3>
          <label className="text-xs text-slate-400">Spending month (Nairobi)
            <input aria-label="Budget spending month" type="month" required value={month} className={inputClass}
              onChange={(e) => { if (e.target.value) { setMonth(e.target.value); setLoadingBudgets(true); } }} />
          </label>
          <button type="button" className={buttonClass} onClick={() => onEdit({
            kind: 'budget', record: { id: 0, category: 'Food & Groceries', monthly_limit: 0, currency: 'KES' },
          })}>+ Create budget</button>
        </div>
        <p className="text-xs text-slate-400">Actuals include all active expenses and fees for the selected month, excluding transfer principal and reconciliation. Limits recur monthly; editing a limit does not create historical monthly versions.</p>
        {budgetError ? <div role="alert" className="text-sm text-rose-300">{budgetError} <button type="button" className="underline" onClick={() => { void loadBudgets(); }}>Retry</button></div>
          : loadingBudgets ? <p className="text-sm text-slate-400">Loading spending...</p>
            : budgets.length === 0 ? <p className="text-sm text-slate-400">No active budgets. Create a monthly category limit.</p> : (
              <div className="grid gap-4 md:grid-cols-2">{budgets.map((budget) => (
                <article key={budget.id} className="space-y-2 rounded-xl border border-slate-800 p-4 text-sm">
                  <h4 className="font-semibold">{budget.category}</h4>
                  <p className="text-slate-400">Spent {money(budget.actual_spending ?? 0)} / {money(budget.monthly_limit)}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div
                    className={`h-full ${budget.overspent ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, budget.monthly_limit ? (budget.actual_spending ?? 0) / budget.monthly_limit * 100 : budget.overspent ? 100 : 0)}%` }} /></div>
                  <p className={budget.overspent ? 'font-semibold text-rose-300' : 'text-emerald-300'}>
                    {budget.overspent ? `Overspent by ${money(-(budget.remaining ?? 0))}` : `${money(budget.remaining ?? 0)} remaining`}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" className={buttonClass} onClick={() => onEdit({ kind: 'budget', record: budget })}>Edit / Retire</button>
                    <button type="button" className={buttonClass} onClick={() => onHistory({ kind: 'budget', id: budget.id, name: budget.category })}>History</button>
                  </div>
                </article>
              ))}</div>
            )}
      </section>
      {activity && <GoalActivity key={activity.id} goal={activity} onClose={() => setActivity(undefined)} onChanged={onChanged} />}
    </div>
  );
}

function GoalActivity({ goal, onClose, onChanged }: { goal: PersonalSavingsGoal; onClose: () => void; onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState(goal);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('earmark');
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setHistoryError('');
    try {
      const data = await apiJson<{ contributions: GoalContribution[]; hasMore: boolean }>(`/api/goals?id=${goal.id}&page=${page}`, { signal });
      if (!signal?.aborted) { setContributions(data.contributions); setHasMore(data.hasMore); }
    } catch (reason) { if (!signal?.aborted) setHistoryError(reason instanceof Error ? reason.message : 'Could not load contribution history.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [goal.id, page]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="goal-activity-title">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-slate-800 bg-[#111726] p-6">
        <div className="flex justify-between gap-3"><h2 id="goal-activity-title" className="font-bold">{goal.name}: earmarks</h2>
          <button type="button" disabled={busy} onClick={onClose} className="text-sm text-slate-400">Close</button></div>
        <p className="text-sm text-emerald-300">Earmarked: {money(current.current_amount)}</p>
        <p className="text-xs text-slate-400">This records an allocation only, not a transfer or a bank deposit. Release an earmark to correct a contribution; original history is retained.</p>
        {error && <p role="alert" className="text-sm text-rose-300">{error} For a stale record, close and reload the dashboard before retrying.</p>}
        {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
        <form className="space-y-3" onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true); setError(''); setNotice('');
          try {
            const result = await apiJson<{ goal: PersonalSavingsGoal; isDuplicate: boolean }>('/api/goals', jsonRequest('POST', {
              action: 'contribute', id: current.id, version: current.version, request_id: requestId,
              amount: Number(amount) * (direction === 'release' ? -1 : 1), date, note,
            }));
            setCurrent(result.goal); setAmount(''); setNote(''); setRequestId(crypto.randomUUID());
            setNotice(result.isDuplicate ? 'This earmark was already recorded; it was not counted twice.' : 'Earmark history updated. No money moved.');
            if (page === 0) await load(); else setPage(0);
            await onChanged();
          } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save earmark.'); }
          finally { setBusy(false); }
        }}>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block text-xs">Action<select aria-label="Action" value={direction} onChange={(e) => setDirection(e.target.value)} className={inputClass}>
              <option value="earmark">Earmark existing savings</option><option value="release">Release earmark / correct amount</option>
            </select></label>
            <label className="block text-xs">Custom amount (KES)<input type="number" required min="0.01" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} className={inputClass} /></label>
            <label className="block text-xs">Date<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></label>
            <label className="block text-xs">Note (optional)<input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} /></label>
            <button className={`${buttonClass} w-full`}>{busy ? 'Saving...' : 'Record allocation change'}</button>
          </fieldset>
        </form>
        <h3 className="font-semibold">Contribution & release history</h3>
        {historyError ? <p role="alert" className="text-sm text-rose-300">{historyError} <button type="button" className="underline" onClick={() => { void load(); }}>Retry</button></p>
          : loading ? <p className="text-sm text-slate-400">Loading history...</p>
            : contributions.length === 0 ? <p className="text-sm text-slate-400">No allocations yet.</p> : contributions.map((entry) => (
              <div key={entry.id} className="border-t border-slate-800 pt-2 text-xs">
                <p className={entry.amount < 0 ? 'text-amber-300' : 'text-emerald-300'}>{entry.date}: {entry.amount < 0 ? 'Released' : 'Earmarked'} {money(Math.abs(entry.amount))}</p>
                <p className="text-slate-400">{entry.note}</p>
              </div>
            ))}
        <div className="flex justify-between text-xs">
          <button type="button" disabled={page === 0 || loading || busy} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Newer</button>
          <span>Page {page + 1}</span>
          <button type="button" disabled={!hasMore || loading || busy} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Older</button>
        </div>
      </div>
    </div>
  );
}
