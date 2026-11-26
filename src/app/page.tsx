'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  todayLocal, type Category, type PersonalAccount, type PersonalTransaction, type PersonalAsset,
  type PersonalLiability, type PersonalSavingsGoal, type TransactionPage, type NetWorthMetrics as FinancialMetrics,
} from '@/lib/repo/types';
import { KENYAN_EXPENSE_CATEGORIES } from '@/lib/categories';
import { apiFetch, apiJson, jsonRequest } from '@/lib/api-client';
import ImportPanel from '@/components/ImportPanel';
import RecordEditor, { type EditableSelection } from '@/components/RecordEditor';
import HistoryDialog, { type HistorySelection } from '@/components/HistoryDialog';
import PlanningPanel from '@/components/PlanningPanel';
import LogoutButton from '@/components/LogoutButton';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface NetWorthMetrics extends FinancialMetrics {
  isDatabaseConnected?: boolean;
}

interface ExpenseSummary {
  category: string;
  icon: string;
  color: string;
  total_amount: number;
  transaction_count: number;
}

type TransactionType = Exclude<PersonalTransaction['type'], 'adjustment'>;
type DashboardTab = 'overview' | 'accounts' | 'transactions' | 'import' | 'networth' | 'goals';

// Format Kenyan Shilling
const formatKES = (val: number | string) => {
  const num = typeof val === 'number' ? val : parseFloat(String(val) || '0');
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace('KES', 'KSh ');
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [metrics, setMetrics] = useState<NetWorthMetrics | null>(null);
  const [accounts, setAccounts] = useState<PersonalAccount[]>([]);
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [assets, setAssets] = useState<PersonalAsset[]>([]);
  const [liabilities, setLiabilities] = useState<PersonalLiability[]>([]);
  const [goals, setGoals] = useState<PersonalSavingsGoal[]>([]);
  const [categories, setCategories] = useState<Category[]>(KENYAN_EXPENSE_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditableSelection>();
  const [history, setHistory] = useState<HistorySelection>();
  const [formSaving, setFormSaving] = useState(false);
  const creationRequests = useRef(new Map<string, string>());
  const [formError, setFormError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const CATEGORIES_LIST = categories.map((category) => category.name);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAccountId, setSelectedAccountId] = useState('All');
  const [transactionType, setTransactionType] = useState('All');
  const [transactionStatus, setTransactionStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [txPage, setTxPage] = useState(0);
  const [txTotal, setTxTotal] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionError, setTransactionError] = useState('');

  // Modals
  const [showTxModal, setShowTxModal] = useState(false);
  const [showAccModal, setShowAccModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showLiabModal, setShowLiabModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [txSaving, setTxSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState({
    account_id: '', actual_balance: '', date: '', reason: '',
  });

  // New Transaction Form State
  const [newTx, setNewTx] = useState({
    account_id: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    date: '',
    description: '',
    category: 'Food & Groceries',
    reference: '',
    transfer_account_id: '',
    fee_amount: '',
  });

  // New Account Form State
  const [newAcc, setNewAcc] = useState({
    name: '',
    institution: '',
    account_type: 'mobile_money',
    currency: 'KES',
    balance: '',
    account_identifier: '',
  });

  // New Asset Form State
  const [newAsset, setNewAsset] = useState({
    name: '',
    category: 'land',
    estimated_value: '',
    notes: '',
  });

  // New Liability Form State
  const [newLiab, setNewLiab] = useState({
    name: '',
    creditor: '',
    category: 'personal_loan',
    principal_amount: '',
    outstanding_balance: '',
    interest_rate: '',
    monthly_payment: '',
  });

  // New Goal Form State
  const [newGoal, setNewGoal] = useState({
    name: '',
    target_amount: '',
    current_amount: '',
    target_date: '',
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAllData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [netData, accData, expData, alData, goalData, categoryData] = await Promise.all([
        apiJson<NetWorthMetrics>('/api/networth'),
        apiJson<{ accounts: PersonalAccount[] }>('/api/transactions?type=accounts'),
        apiJson<{ expenses: ExpenseSummary[] }>('/api/expenses/by_category'),
        apiJson<{ assets: PersonalAsset[]; liabilities: PersonalLiability[] }>('/api/assets-liabilities'),
        apiJson<{ goals: PersonalSavingsGoal[] }>('/api/goals'),
        apiJson<{ categories: Category[] }>('/api/categories'),
      ]);
      if (!netData || typeof netData.netWorth !== 'number' || !Array.isArray(accData.accounts) ||
          !Array.isArray(expData.expenses) || !Array.isArray(alData.assets) || !Array.isArray(alData.liabilities) ||
          !Array.isArray(goalData.goals) || !Array.isArray(categoryData.categories)) {
        throw new Error('The server returned incomplete financial data. Retry instead of relying on these totals.');
      }
      setMetrics(netData); setAccounts(accData.accounts); setExpenses(expData.expenses);
      setAssets(alData.assets); setLiabilities(alData.liabilities); setGoals(goalData.goals); setCategories(categoryData.categories);
      if (accData.accounts.length > 0) setNewTx((prev) => prev.account_id ? prev : { ...prev, account_id: String(accData.accounts[0].id) });
      setDataError(''); setTransactionsLoading(true); setRefreshKey((key) => key + 1);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : 'Could not load financial data. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [setNewTx]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAllData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAllData]);

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    setTransactionsLoading(true); setTransactionError('');
    const params = new URLSearchParams({ limit: '50', offset: String(txPage * 50) });
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (selectedCategory !== 'All') params.set('category', selectedCategory);
    if (selectedAccountId !== 'All') params.set('accountId', selectedAccountId);
    if (transactionType !== 'All') params.set('transactionType', transactionType);
    params.set('status', transactionStatus);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    try {
      const data = await apiJson<TransactionPage>(`/api/transactions?${params}`, { signal });
      if (!signal?.aborted) {
        setTransactions(data.transactions); setTxTotal(data.total); setHasMoreTransactions(data.hasMore); setNeedsReviewCount(data.needsReviewCount);
      }
    } catch (reason) {
      if (!signal?.aborted) setTransactionError(reason instanceof Error ? reason.message : 'Could not load transactions.');
    } finally { if (!signal?.aborted) setTransactionsLoading(false); }
  }, [searchQuery, selectedCategory, selectedAccountId, transactionType, transactionStatus, startDate, endDate, txPage]);

  useEffect(() => {
    if (activeTab !== 'transactions') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadTransactions(controller.signal); }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeTab, loadTransactions, refreshKey]);

  // Submit Manual Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (txSaving) return;
    if (!newTx.amount || !newTx.description || !newTx.account_id) {
      showToast('Please fill all required fields');
      return;
    }

    setTxSaving(true); setFormError('');
    try {
      const reference = newTx.reference || `TXN${crypto.randomUUID()}`;
      setNewTx((previous) => ({ ...previous, reference }));
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTx, reference }),
      });

      if (res.ok) {
        showToast('Transaction added successfully!');
        setShowTxModal(false);
        setNewTx({
          account_id: accounts[0]?.id ? String(accounts[0].id) : '',
          amount: '',
          type: 'expense',
          date: todayLocal(),
          description: '',
          category: 'Food & Groceries',
          reference: '',
          transfer_account_id: '',
          fee_amount: '',
        });
        await loadAllData(false);
      } else {
        const err = await res.json();
        setFormError(err.error || 'Failed to add transaction. Retry.');
      }
    } catch {
      setFormError('Could not confirm the save. Retry with the same reference to avoid counting it twice.');
    } finally {
      setTxSaving(false);
    }
  };

  const openTransactionModal = () => {
    setFormError('');
    setNewTx((prev) => ({
      ...prev,
      date: prev.date || todayLocal(),
    }));
    setShowTxModal(true);
  };

  const handleReconcile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (reconciling) return;
    setReconciling(true);
    try {
      const response = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reconcile_account', ...reconciliation,
          version: accounts.find((account) => String(account.id) === reconciliation.account_id)?.version,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error || 'Failed to reconcile balance. Retry.');
        return;
      }
      showToast(data.adjustment ? 'Balance reconciled; adjustment recorded in history' : 'Balance already matches');
      setReconciliation({ account_id: '', actual_balance: '', date: '', reason: '' });
      await loadAllData(false);
    } catch {
      setFormError('Could not reconcile the balance. Retry.');
    } finally {
      setReconciling(false);
    }
  };

  const createRecord = async (url: string, body: object, close: () => void, message: string) => {
    if (formSaving) return;
    setFormSaving(true); setFormError('');
    const scope = `${url}:${'kind' in body ? body.kind : 'type' in body ? body.type : ''}`;
    const requestId = creationRequests.current.get(scope) ?? crypto.randomUUID();
    creationRequests.current.set(scope, requestId);
    try {
      await apiJson(url, jsonRequest('POST', { ...body, request_id: requestId }));
      creationRequests.current.delete(scope);
      close(); showToast(message); await loadAllData(false);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Could not save. Retry.'); }
    finally { setFormSaving(false); }
  };

  const handleCreateAccount = (event: React.FormEvent) => {
    event.preventDefault();
    void createRecord('/api/transactions', { type: 'new_account', ...newAcc, balance: newAcc.balance || '0' }, () => {
      setShowAccModal(false);
      setNewAcc({ name: '', institution: '', account_type: 'mobile_money', currency: 'KES', balance: '', account_identifier: '' });
    }, 'Account created.');
  };
  const handleCreateAsset = (event: React.FormEvent) => {
    event.preventDefault();
    void createRecord('/api/assets-liabilities', { kind: 'asset', ...newAsset }, () => {
      setShowAssetModal(false); setNewAsset({ name: '', category: 'land', estimated_value: '', notes: '' });
    }, 'Asset added.');
  };
  const handleCreateLiability = (event: React.FormEvent) => {
    event.preventDefault();
    void createRecord('/api/assets-liabilities', {
      kind: 'liability', ...newLiab, principal_amount: newLiab.principal_amount || newLiab.outstanding_balance,
      interest_rate: newLiab.interest_rate || undefined, monthly_payment: newLiab.monthly_payment || undefined,
    }, () => {
      setShowLiabModal(false);
      setNewLiab({ name: '', creditor: '', category: 'personal_loan', principal_amount: '', outstanding_balance: '', interest_rate: '', monthly_payment: '' });
    }, 'Liability recorded.');
  };
  const handleCreateGoal = (event: React.FormEvent) => {
    event.preventDefault();
    void createRecord('/api/goals', { ...newGoal, current_amount: newGoal.current_amount || '0' }, () => {
      setShowGoalModal(false); setNewGoal({ name: '', target_amount: '', current_amount: '', target_date: '' });
    }, 'Savings goal created. No money moved.');
  };

  const handleCategorizeTransaction = async (transactionId: string | number, category: string) => {
    if (txSaving) return;
    setTxSaving(true);
    try {
      await apiJson('/api/transactions', jsonRequest('PATCH', {
        id: transactionId, category, version: transactions.find((transaction) => transaction.id === transactionId)?.version,
      }));
      setRefreshKey((key) => key + 1);
      showToast('Transfer categorized');
    } catch (reason) { setTransactionError(reason instanceof Error ? reason.message : 'Could not categorize transfer.'); }
    finally { setTxSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-slate-950 px-5 py-3 rounded-xl font-medium shadow-2xl flex items-center gap-3 animate-bounce">
          <span>✓</span> {toastMessage}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-[#0F1420]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-xl shadow-lg shadow-emerald-900/30">
              🇰🇪
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Track-suite <span className="hidden sm:inline text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">MVP Personal Wealth</span>
              </h1>
              <p className="hidden sm:block text-xs text-slate-400">Personal Net Worth, M-Pesa & Cash Flow Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {metrics?.isDatabaseConnected && !dataError && !loading ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                PostgreSQL Connected
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/80">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                {loading ? 'Loading financial data...' : 'Financial data unavailable'}
              </span>
            )}

            <button
              id="btn-add-tx"
              onClick={openTransactionModal}
              disabled={loading || !!dataError || accounts.length === 0}
              title={accounts.length === 0 ? 'Create an account first' : undefined}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-lg shadow-emerald-950 flex items-center gap-1.5"
            >
              <span>+</span> Add Transaction
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 sm:space-x-4 border-t border-slate-800/50 overflow-x-auto scrollbar-none">
          {[
            { id: 'overview', label: 'Overview & Net Worth', icon: '📊' },
            { id: 'accounts', label: 'Accounts & Wallets', icon: '💳' },
            { id: 'transactions', label: 'Transactions', icon: '📝' },
            { id: 'import', label: 'M-Pesa / CSV Import', icon: '📥' },
            { id: 'networth', label: 'Assets & Debts', icon: '⚖️' },
            { id: 'goals', label: 'Budgets & Goals', icon: '🎯' },
          ].map((tab) => (
            <button
              key={tab.id}
              aria-label={tab.label}
              onClick={() => {
                if (tab.id === 'transactions' && activeTab !== 'transactions') setTransactionsLoading(true);
                setActiveTab(tab.id as DashboardTab);
              }}
              className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <Link href="/settings" className="whitespace-nowrap px-3 py-3 text-xs text-teal-300">Settings / Profile</Link>
          <Link href="/settings/ingest" className="whitespace-nowrap px-3 py-3 text-xs text-teal-300">SMS tokens</Link>
          <div className="flex items-center px-3"><LogoutButton /></div>
          <button type="button" disabled={loading} onClick={() => { void loadAllData(); }} className="px-3 text-xs text-slate-400 disabled:opacity-40">Refresh</button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-4 text-slate-400">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Calculating personal wealth balance sheet...</p>
          </div>
        ) : dataError ? (
          <div role="alert" className="space-y-3 rounded-2xl border border-rose-900 bg-rose-950/30 p-6 text-sm text-rose-200">
            <h2 className="font-bold">Financial data could not be loaded</h2>
            <p>{dataError}</p>
            <p>No zero-balance or in-memory fallback is being shown. Check PostgreSQL and that all migrations have been applied, then retry.</p>
            <button type="button" onClick={() => { void loadAllData(); }} className="rounded-lg bg-slate-800 px-4 py-2 text-white">Retry loading dashboard</button>
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW & NET WORTH */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Net Worth Hero Banner */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2 bg-gradient-to-br from-emerald-950/40 via-[#0F172A] to-[#0A0D14] border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -z-10"></div>
                    <p className="text-xs uppercase tracking-wider font-semibold text-emerald-400">Real-Time Net Worth</p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2 tracking-tight">
                      {formatKES(metrics?.netWorth || 0)}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">Total Assets minus Total Outstanding Liabilities</p>

                    <div className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-slate-800">
                      <div>
                        <span className="text-[11px] text-slate-400 block">Total Assets</span>
                        <span className="text-sm font-semibold text-emerald-400">{formatKES(metrics?.totalAssets || 0)}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Total Liabilities</span>
                        <span className="text-sm font-semibold text-rose-400">{formatKES(metrics?.totalLiabilities || 0)}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">Debt-to-Asset</span>
                        <span className="text-sm font-semibold text-amber-400">
                          {(metrics?.debtToAssetRatio || 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cash Flow Summary */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Monthly Cash Inflow</p>
                      <h3 className="text-2xl font-bold text-white mt-1">{formatKES(metrics?.monthlyIncome || 0)}</h3>
                      <p className="text-xs text-slate-400 mt-1">Salary & Business Inflows</p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Monthly Expenses</p>
                      <h3 className="text-xl font-bold text-rose-400 mt-1">{formatKES(metrics?.monthlyExpenses || 0)}</h3>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                        <span>Net Savings:</span>
                        <span className="font-semibold text-emerald-400">{formatKES(metrics?.netSavings || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Savings Rate Card */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Personal Savings Rate</p>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-4xl font-extrabold text-teal-400">
                          {(metrics?.savingsRate || 0).toFixed(0)}%
                        </span>
                        <span className="text-xs text-slate-400">of income saved</span>
                      </div>

                      <div className="w-full bg-slate-800 h-2.5 rounded-full mt-4 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, metrics?.savingsRate || 0))}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 pt-4 border-t border-slate-800">
                      <span>💡 </span>
                      {(metrics?.savingsRate || 0) >= 30
                        ? 'Superb savings velocity! Maintain KES cash in high-yield MMFs.'
                        : 'Aim for a 30% savings rate to accelerate debt freedom & land acquisitions.'}
                    </div>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Expense Breakdown Donut */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
                      <span>This Month&apos;s Expense Breakdown</span>
                      <span className="text-xs text-slate-400">{expenses.length} Categories</span>
                    </h3>
                    <div className="h-64">
                      {expenses.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expenses}
                              dataKey="total_amount"
                              nameKey="category"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={4}
                            >
                              {expenses.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || '#10B981'} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number | string | readonly (number | string)[] | undefined) => {
                                const amount =
                                  typeof value === 'object' && value !== null
                                    ? Number(Object.values(value)[0] || 0)
                                    : value ?? 0;
                                return [formatKES(amount), 'Spent'];
                              }}
                              contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                          No expense transactions recorded yet
                        </div>
                      )}
                    </div>

                    {/* Category Legend Chips */}
                    <div className="flex flex-wrap gap-2 mt-4 max-h-24 overflow-y-auto pr-1">
                      {expenses.map((c) => (
                        <span
                          key={c.category}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5"
                        >
                          <span>{c.icon}</span>
                          <span>{c.category}:</span>
                          <span className="font-semibold text-white">{formatKES(c.total_amount)}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Liquid Cash & Bank Allocation */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-white">Liquid Balances by Account</h3>
                      <button
                        onClick={() => setActiveTab('accounts')}
                        className="text-xs text-emerald-400 hover:underline"
                      >
                        Manage Accounts →
                      </button>
                    </div>

                    <div className="space-y-3">
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-lg">
                              {acc.account_type === 'mobile_money'
                                ? '📱'
                                : acc.account_type === 'sacco'
                                ? '🤝'
                                : acc.account_type === 'investment'
                                ? '📈'
                                : '🏦'}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{acc.name}</p>
                              <p className="text-xs text-slate-400">{acc.institution || acc.account_type}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-emerald-400">{formatKES(acc.balance)}</p>
                            <span className="text-[10px] text-slate-500 uppercase">{acc.currency}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ACCOUNTS & WALLETS */}
            {activeTab === 'accounts' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Personal Accounts & Wallets</h2>
                    <p className="text-xs text-slate-400">Track M-Pesa, Bank Accounts, SACCO shares, and Money Market Funds</p>
                  </div>
                  <button
                    onClick={() => { setFormError(''); setShowAccModal(true); }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 self-start"
                  >
                    <span>+</span> Add New Account
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="bg-[#111726] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">
                            {acc.account_type === 'mobile_money'
                              ? '📱'
                              : acc.account_type === 'sacco'
                              ? '🤝'
                              : acc.account_type === 'investment'
                              ? '📈'
                              : '🏦'}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                            {acc.currency}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-3">{acc.name}</h3>
                        <p className="text-xs text-slate-400">{acc.institution}</p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Balance:</span>
                        <span className="text-lg font-extrabold text-emerald-400">{formatKES(acc.balance)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Opening balance: {formatKES(acc.opening_balance ?? 0)}</p>
                      {['bank_checking', 'bank_savings', 'sacco'].includes(acc.account_type) && (
                        <button className="mt-2 text-xs text-teal-400 hover:underline self-start"
                          onClick={() => setEditor({ kind: 'account', record: acc })}>
                          {acc.account_identifier ? `SMS identifier ending ${acc.account_identifier.slice(-4)} (change)` : 'Set bank SMS identifier'}
                        </button>
                      )}
                      <button
                        onClick={() => { setFormError(''); setReconciliation({ account_id: String(acc.id), actual_balance: '', date: todayLocal(), reason: '' }); }}
                        className="mt-3 text-xs text-emerald-400 hover:underline self-start"
                      >
                        Reconcile to statement balance
                      </button>
                      <div className="mt-3 flex gap-4 text-xs text-teal-300">
                        <button type="button" onClick={() => setEditor({ kind: 'account', record: acc })}>Edit account</button>
                        <button type="button" onClick={() => setHistory({ kind: 'account', id: acc.id, name: acc.name })}>History</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: TRANSACTIONS & CASH FLOW */}
            {activeTab === 'transactions' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Transactions History</h2>
                    <p className="text-xs text-slate-400">All inflows, expenses, and savings transfers</p>
                  </div>
                  {needsReviewCount > 0 && (
                    <button
                      onClick={() => { setSelectedCategory('Needs review'); setTxPage(0); setTransactionsLoading(true); }}
                      className="text-xs font-semibold px-3 py-2 rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-950/60"
                    >
                      {needsReviewCount} transfer{needsReviewCount === 1 ? '' : 's'} need categorizing
                    </button>
                  )}
                  <button
                    onClick={openTransactionModal}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 self-start"
                  >
                    <span>+</span> Record Transaction
                  </button>
                </div>

                {/* Filters */}
                <div className="bg-[#111726] border border-slate-800 rounded-xl p-3 flex flex-wrap gap-3 items-center">
                  <input
                    type="text"
                    placeholder="Search by description or reference..."
                    aria-label="Search transaction history"
                    maxLength={200}
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setTxPage(0); setTransactionsLoading(true); }}
                    className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  <select
                    value={selectedCategory}
                    aria-label="Filter transaction category"
                    onChange={(e) => { setSelectedCategory(e.target.value); setTxPage(0); setTransactionsLoading(true); }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="All">All Categories</option>
                    <option value="Needs review">Needs review</option>
                    {CATEGORIES_LIST.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={selectedAccountId}
                    aria-label="Filter transaction account"
                    onChange={(e) => { setSelectedAccountId(e.target.value); setTxPage(0); setTransactionsLoading(true); }}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="All">All Accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                  <select aria-label="Filter transaction type" value={transactionType}
                    onChange={(e) => { setTransactionType(e.target.value); setTxPage(0); setTransactionsLoading(true); }}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs">
                    <option value="All">All types</option><option value="income">Income</option><option value="expense">Expense</option>
                    <option value="transfer">Transfer</option><option value="adjustment">Reconciliation</option>
                  </select>
                  <select aria-label="Filter transaction status" value={transactionStatus}
                    onChange={(e) => { setTransactionStatus(e.target.value); setTxPage(0); setTransactionsLoading(true); }}
                    className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs">
                    <option value="active">Active transactions</option><option value="reversed">Reversed transactions (history)</option><option value="all">Active & reversed</option>
                  </select>
                  <label className="text-xs text-slate-400">From<input aria-label="Transaction start date" type="date" value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setTxPage(0); setTransactionsLoading(true); }} className="ml-2 rounded-lg bg-slate-900 p-2" /></label>
                  <label className="text-xs text-slate-400">To<input aria-label="Transaction end date" type="date" value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setTxPage(0); setTransactionsLoading(true); }} className="ml-2 rounded-lg bg-slate-900 p-2" /></label>
                </div>

                {transactionError && <div role="alert" className="rounded-xl border border-rose-900 p-3 text-sm text-rose-300">
                  {transactionError} <button type="button" onClick={() => { void loadTransactions(); }} className="ml-2 underline">Retry transactions</button>
                </div>}
                {/* Table */}
                <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Source Account</th>
                          <th className="py-3 px-4">Ref Code</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                          <th className="py-3 px-4">Maintenance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {transactionsLoading || transactionError ? (
                          <tr><td colSpan={7} className="p-6 text-center font-sans text-slate-400">
                            {transactionsLoading ? 'Loading transaction history...' : 'Transaction history unavailable. Retry above.'}
                          </td></tr>
                        ) : transactions.length > 0 ? (
                          transactions.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-3 px-4 whitespace-nowrap text-slate-400">{t.date}</td>
                              <td className="py-3 px-4 font-sans font-medium text-white max-w-xs">
                                {t.description}
                                {t.voided_at && <span className="block text-[10px] text-amber-300">Reversed - excluded from balances and reports</span>}
                                {t.parent_transaction_id && <span className="block text-[10px] text-slate-500">Linked fee for transaction #{t.parent_transaction_id}</span>}
                              </td>
                              <td className="py-3 px-4 font-sans">
                                {!t.voided_at && t.type === 'transfer' && (!t.category || t.category.toLowerCase() === 'other') ? (
                                  <select
                                    value=""
                                    disabled={txSaving}
                                    onChange={(event) => void handleCategorizeTransaction(t.id, event.target.value)}
                                    className="bg-amber-950/40 border border-amber-700/60 rounded-full px-2 py-0.5 text-[11px] text-amber-300"
                                  >
                                    <option value="">Needs category</option>
                                    {CATEGORIES_LIST.filter((category) => category !== 'Other').map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-300">
                                    {t.category}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-sans text-slate-400">
                                {t.account_name || 'Account'}{t.transfer_account_name ? ` -> ${t.transfer_account_name}` : ''}
                              </td>
                              <td className="py-3 px-4 text-slate-500 text-[11px]">{t.reference || '-'}</td>
                              <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
                                t.type === 'income' ? 'text-emerald-400' : t.type === 'expense' ? 'text-rose-400' : 'text-blue-400'
                              }`}>
                                {t.type === 'income' ? '+' : t.type === 'expense' ? '-' :
                                  t.type === 'adjustment' ? (t.amount >= 0 ? '+' : '-') : '⇄'} {formatKES(Math.abs(t.amount))}
                              </td>
                              <td className="py-3 px-4 font-sans">
                                <div className="flex flex-col items-start gap-2 whitespace-nowrap text-teal-300">
                                  {!t.parent_transaction_id && !t.voided_at && <button type="button" onClick={() => setEditor({ kind: 'transaction', record: t })}>
                                    {t.type === 'adjustment' ? 'Reverse adjustment' : 'Edit / Reverse'}
                                  </button>}
                                  <button type="button" onClick={() => setHistory({ kind: 'transaction', id: t.id, name: t.description })}>History</button>
                                </div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                              No matching transactions found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <button type="button" disabled={txPage === 0 || transactionsLoading} onClick={() => { setTxPage(txPage - 1); setTransactionsLoading(true); }}
                      className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Previous</button>
                    <span>{transactionError ? 'Count unavailable' : transactionsLoading ? 'Loading...' : `Page ${txPage + 1} | ${txTotal} matching transactions`}</span>
                    <button type="button" disabled={!hasMoreTransactions || transactionsLoading || !!transactionError} onClick={() => { setTxPage(txPage + 1); setTransactionsLoading(true); }}
                      className="rounded-lg bg-slate-800 px-3 py-2 disabled:opacity-40">Next</button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: M-PESA & CSV STATEMENT IMPORT */}
            {activeTab === 'import' && (
              <ImportPanel accounts={accounts} categories={CATEGORIES_LIST} onChanged={() => loadAllData(false)} />
            )}

            {/* TAB 5: ASSETS & LIABILITIES (NET WORTH DETAILS) */}
            {activeTab === 'networth' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Assets & Liabilities Balance Sheet</h2>
                    <p className="text-xs text-slate-400">Physical property, land, vehicles vs outstanding loans & mortgages</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setFormError(''); setShowAssetModal(true); }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                    >
                      + Add Asset
                    </button>
                    <button
                      onClick={() => { setFormError(''); setShowLiabModal(true); }}
                      className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                    >
                      + Add Debt / Loan
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Physical Assets Column */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>🏡</span> Physical & Fixed Assets
                      </h3>
                      <span className="text-xs font-bold text-emerald-400">
                        {formatKES(metrics?.physicalAssets || 0)}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-bold text-white">{asset.name}</p>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                              {asset.category}
                            </span>
                            {asset.notes && <p className="text-[11px] text-slate-500 mt-1">{asset.notes}</p>}
                            <div className="mt-2 flex gap-4 text-xs text-teal-300">
                              <button type="button" onClick={() => setEditor({ kind: 'asset', record: asset })}>Edit</button>
                              <button type="button" onClick={() => setHistory({ kind: 'asset', id: asset.id, name: asset.name })}>History</button>
                            </div>
                          </div>
                          <span className="text-sm font-extrabold text-emerald-400">
                            {formatKES(asset.estimated_value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Liabilities & Debts Column */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>🏛️</span> Outstanding Liabilities
                      </h3>
                      <span className="text-xs font-bold text-rose-400">
                        {formatKES(metrics?.totalLiabilities || 0)}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {liabilities.map((liab) => (
                        <div
                          key={liab.id}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-xs font-bold text-white">{liab.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {liab.creditor} • {liab.interest_rate ? `${liab.interest_rate}% p.a.` : 'Standard'}
                            </p>
                            {liab.monthly_payment && (
                              <p className="text-[11px] text-amber-400 mt-1">
                                Pay: {formatKES(liab.monthly_payment)}/mo
                              </p>
                            )}
                            <div className="mt-2 flex gap-4 text-xs text-teal-300">
                              <button type="button" onClick={() => setEditor({ kind: 'liability', record: liab })}>Edit</button>
                              <button type="button" onClick={() => setHistory({ kind: 'liability', id: liab.id, name: liab.name })}>History</button>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-extrabold text-rose-400">
                              {formatKES(liab.outstanding_balance)}
                            </span>
                            <span className="block text-[10px] text-slate-500">
                              Orig: {formatKES(liab.principal_amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: BUDGETS & SAVINGS GOALS */}
            {activeTab === 'goals' && (
              <PlanningPanel goals={goals} onCreateGoal={() => { setFormError(''); setShowGoalModal(true); }}
                onEdit={setEditor} onHistory={setHistory} onChanged={() => loadAllData(false)} />
            )}
          </>
        )}
      </main>

      {editor && <RecordEditor key={`${editor.kind}-${editor.record.id}`} selection={editor} accounts={accounts} categories={CATEGORIES_LIST}
        onClose={() => setEditor(undefined)} onReload={async () => { setEditor(undefined); await loadAllData(false); }}
        onSaved={async () => {
          await loadAllData(false); setEditor(undefined); showToast('Change saved with history.');
        }} />}
      {history && <HistoryDialog key={`${history.kind}-${history.id}`} selection={history} onClose={() => setHistory(undefined)} />}

      {reconciliation.account_id && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Reconcile account balance</h3>
            <p className="text-xs text-slate-400">
              Import all history first. The difference is saved as an adjustment, not income or spending.
            </p>
            <form onSubmit={handleReconcile} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <fieldset disabled={reconciling} className="contents">
              <label className="block text-xs text-slate-400">
                Actual statement balance (KES)
                <input type="number" step="0.01" required value={reconciliation.actual_balance}
                  onChange={(e) => setReconciliation({ ...reconciliation, actual_balance: e.target.value })}
                  className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white" />
              </label>
              <label className="block text-xs text-slate-400">
                Statement date
                <input type="date" required value={reconciliation.date}
                  onChange={(e) => setReconciliation({ ...reconciliation, date: e.target.value })}
                  className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white" />
              </label>
              <label className="block text-xs text-slate-400">
                Reason / statement reference
                <input required maxLength={500} value={reconciliation.reason}
                  onChange={(e) => setReconciliation({ ...reconciliation, reason: e.target.value })}
                  className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white" />
              </label>
              <div className="flex gap-3">
                <button disabled={reconciling} className="bg-emerald-600 rounded-lg px-4 py-2 text-xs">
                  {reconciling ? 'Saving...' : 'Record adjustment'}
                </button>
                <button type="button" disabled={reconciling}
                  onClick={() => setReconciliation({ ...reconciliation, account_id: '' })}
                  className="text-xs text-slate-400">Cancel</button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TRANSACTION */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Record Transaction</h3>
              <button disabled={txSaving} onClick={() => setShowTxModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form aria-label="Record transaction" onSubmit={handleCreateTransaction} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <fieldset disabled={txSaving} className="contents">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Account</label>
                <select
                  aria-label="Transaction account"
                  value={newTx.account_id}
                  onChange={(e) => setNewTx({ ...newTx, account_id: e.target.value, transfer_account_id: '' })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Type</label>
                  <select
                    aria-label="Transaction type"
                    value={newTx.type}
                    onChange={(e) => setNewTx({ ...newTx, type: e.target.value as TransactionType, transfer_account_id: '' })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Amount (KES)</label>
                  <input
                    aria-label="Transaction amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={newTx.amount}
                    onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                    placeholder="e.g. 2500"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              {newTx.type === 'transfer' && (
                <label className="block text-xs text-slate-400">
                  Destination wallet
                  <select required value={newTx.transfer_account_id}
                    onChange={(e) => setNewTx({ ...newTx, transfer_account_id: e.target.value })}
                    className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white">
                    <option value="">Choose destination</option>
                    {accounts.filter((a) => String(a.id) !== newTx.account_id).map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-xs text-slate-400">
                Fee charged to source wallet (KES)
                <input type="number" min="0" step="0.01" value={newTx.fee_amount}
                  aria-label="Transaction fee"
                  onChange={(e) => setNewTx({ ...newTx, fee_amount: e.target.value })}
                  placeholder="0" className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white" />
              </label>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Description / Merchant</label>
                <input
                  aria-label="Transaction description"
                  type="text"
                  required
                  maxLength={500}
                  value={newTx.description}
                  onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                  placeholder="e.g. Naivas Supermarket Food"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select
                    aria-label="Transaction category"
                    value={newTx.category}
                    onChange={(e) => setNewTx({ ...newTx, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    {CATEGORIES_LIST.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input
                    aria-label="Transaction date"
                    type="date"
                    required
                    value={newTx.date}
                    onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Reference (M-Pesa / Bank Ref - Optional)</label>
                <input
                  aria-label="Transaction reference"
                  type="text"
                  maxLength={100}
                  value={newTx.reference}
                  onChange={(e) => setNewTx({ ...newTx, reference: e.target.value })}
                  placeholder="e.g. QHL921KK89"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={txSaving}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                {txSaving ? 'Saving...' : 'Save Transaction'}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ACCOUNT */}
      {showAccModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add New Financial Account</h3>
              <button disabled={formSaving} onClick={() => setShowAccModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form aria-label="Create account" onSubmit={handleCreateAccount} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <fieldset disabled={formSaving} className="contents">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Account Name</label>
                <input
                  aria-label="Account name"
                  type="text"
                  required
                  value={newAcc.name}
                  onChange={(e) => setNewAcc({ ...newAcc, name: e.target.value })}
                  placeholder="e.g. Co-op Salary Current Account"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Institution</label>
                <input
                  aria-label="Institution"
                  type="text"
                  value={newAcc.institution}
                  onChange={(e) => setNewAcc({ ...newAcc, institution: e.target.value })}
                  placeholder="e.g. Co-operative Bank of Kenya"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Account Type</label>
                  <select
                    aria-label="Account type"
                    value={newAcc.account_type}
                    onChange={(e) => setNewAcc({ ...newAcc, account_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="mobile_money">Mobile Money (M-Pesa)</option>
                    <option value="bank_checking">Bank Checking</option>
                    <option value="bank_savings">Bank Savings</option>
                    <option value="sacco">SACCO Deposit</option>
                    <option value="investment">MMF / Investment</option>
                    <option value="cash">Physical Cash</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Opening balance before history (KES)</label>
                  <input
                    aria-label="Opening balance"
                    type="number"
                    value={newAcc.balance}
                    step="0.01"
                    onChange={(e) => setNewAcc({ ...newAcc, balance: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400">
                Usually start at zero, import all history, then reconcile to your statement. Do not enter today&apos;s balance before importing older movements.
              </p>
              {['bank_checking', 'bank_savings', 'sacco'].includes(newAcc.account_type) && (
                <label className="block text-xs text-slate-400">
                  Account digits shown in bank SMS (optional)
                  <input className="block w-full mt-1 bg-slate-900 rounded-lg p-2 text-white" maxLength={40}
                    value={newAcc.account_identifier} onChange={(e) => setNewAcc({ ...newAcc, account_identifier: e.target.value })}
                    placeholder="At least four visible trailing digits" />
                </label>
              )}
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                {formSaving ? 'Saving...' : 'Create Account'}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD ASSET */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add Physical / Fixed Asset</h3>
              <button disabled={formSaving} onClick={() => setShowAssetModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form aria-label="Create asset" onSubmit={handleCreateAsset} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <fieldset disabled={formSaving} className="contents">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Asset Name</label>
                <input
                  aria-label="Asset name"
                  type="text"
                  required
                  value={newAsset.name}
                  onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                  placeholder="e.g. 50x100 Plot in Kitengela"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Category</label>
                  <select
                    aria-label="Asset category"
                    value={newAsset.category}
                    onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="land">Land & Plots</option>
                    <option value="real_estate">Real Estate & Houses</option>
                    <option value="vehicle">Motor Vehicle</option>
                    <option value="investments">NSE Stocks / Bonds</option>
                    <option value="valuables">Valuables & Tech</option>
                    <option value="livestock">Livestock</option>
                    <option value="other">Other asset</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valuation (KES)</label>
                  <input
                    aria-label="Asset valuation"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newAsset.estimated_value}
                    onChange={(e) => setNewAsset({ ...newAsset, estimated_value: e.target.value })}
                    placeholder="e.g. 1500000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={newAsset.notes}
                  onChange={(e) => setNewAsset({ ...newAsset, notes: e.target.value })}
                  placeholder="e.g. Clean title deed, verified by surveyor"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                {formSaving ? 'Saving...' : 'Save Asset to Balance Sheet'}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD LIABILITY */}
      {showLiabModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Record Liability / Debt</h3>
              <button disabled={formSaving} onClick={() => setShowLiabModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form aria-label="Create liability" onSubmit={handleCreateLiability} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <fieldset disabled={formSaving} className="contents">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Loan / Liability Name</label>
                <input
                  aria-label="Liability name"
                  type="text"
                  required
                  value={newLiab.name}
                  onChange={(e) => setNewLiab({ ...newLiab, name: e.target.value })}
                  placeholder="e.g. KCB Secured Car Loan"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Creditor Institution</label>
                <input
                  aria-label="Creditor"
                  type="text"
                  value={newLiab.creditor}
                  onChange={(e) => setNewLiab({ ...newLiab, creditor: e.target.value })}
                  placeholder="e.g. KCB Bank / HELB / SACCO"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Outstanding Balance (KES)</label>
                  <input
                    aria-label="Outstanding balance"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newLiab.outstanding_balance}
                    onChange={(e) => setNewLiab({ ...newLiab, outstanding_balance: e.target.value })}
                    placeholder="e.g. 450000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Monthly Payment (KES)</label>
                  <input
                    aria-label="Monthly payment"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newLiab.monthly_payment}
                    onChange={(e) => setNewLiab({ ...newLiab, monthly_payment: e.target.value })}
                    placeholder="e.g. 15000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                {formSaving ? 'Saving...' : 'Record Liability'}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD GOAL */}
      {showGoalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create Savings Goal</h3>
              <button disabled={formSaving} onClick={() => setShowGoalModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form aria-label="Create savings goal" onSubmit={handleCreateGoal} className="space-y-3">
              {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
              <p className="text-xs text-slate-400">Initial savings are an earmark of existing money, not a deposit. No wallet balances change.</p>
              <fieldset disabled={formSaving} className="contents">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Goal Name</label>
                <input
                  aria-label="Goal name"
                  type="text"
                  required
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                  placeholder="e.g. 6-Month Emergency Fund"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Target Amount (KES)</label>
                  <input
                    aria-label="Goal target"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={newGoal.target_amount}
                    onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })}
                    placeholder="e.g. 300000"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Initial Saved (KES)</label>
                  <input
                    aria-label="Initial earmark"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newGoal.current_amount}
                    onChange={(e) => setNewGoal({ ...newGoal, current_amount: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <label className="block text-xs text-slate-400">Target date (optional)
                <input type="date" value={newGoal.target_date} onChange={(e) => setNewGoal({ ...newGoal, target_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-white" />
              </label>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                {formSaving ? 'Saving...' : 'Create Goal'}
              </button>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
