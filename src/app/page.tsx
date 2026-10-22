'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface PersonalAccount {
  id: string | number;
  name: string;
  institution: string;
  account_type: string;
  currency: string;
  balance: number;
  is_asset: boolean;
}

interface PersonalTransaction {
  id: string | number;
  account_id: string | number;
  account_name?: string;
  amount: number;
  currency: string;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  description: string;
  category: string;
  reference?: string;
  import_source: string;
}

interface PersonalAsset {
  id: string | number;
  name: string;
  category: string;
  estimated_value: number;
  currency: string;
  notes?: string;
}

interface PersonalLiability {
  id: string | number;
  name: string;
  creditor: string;
  category: string;
  principal_amount: number;
  outstanding_balance: number;
  interest_rate?: number;
  monthly_payment?: number;
  currency: string;
  due_date?: string;
  notes?: string;
}

interface PersonalBudget {
  id: string | number;
  category: string;
  monthly_limit: number;
  currency: string;
}

interface PersonalSavingsGoal {
  id: string | number;
  name: string;
  target_amount: number;
  current_amount: number;
  currency: string;
  target_date?: string;
}

interface NetWorthMetrics {
  netWorth: number;
  totalAssets: number;
  liquidCash: number;
  physicalAssets: number;
  totalLiabilities: number;
  debtToAssetRatio: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netSavings: number;
  savingsRate: number;
  isDatabaseConnected?: boolean;
}

// Format Kenyan Shilling
const formatKES = (val: number | string) => {
  const num = typeof val === 'number' ? val : parseFloat(String(val) || '0');
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(num)
    .replace('KES', 'KSh ');
};

const CATEGORIES_LIST = [
  'Food & Groceries',
  'Rent & Housing',
  'Utilities & Water (KPLC)',
  'Airtime & Internet (Safaricom)',
  'Transport & Fuel (Matatu/Petrol)',
  'Family & Chamas',
  'Shopping & Essentials',
  'Healthcare & Pharmacy',
  'Education & School Fees',
  'Entertainment & Dining',
  'Salary & Primary Income',
  'Side Hustle & Consulting',
  'Transfers & Remittance',
  'Savings & MMF Deposit',
  'Loan & Fuliza Repayment',
  'Other',
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'transactions' | 'import' | 'networth' | 'goals'>('overview');
  const [metrics, setMetrics] = useState<NetWorthMetrics | null>(null);
  const [accounts, setAccounts] = useState<PersonalAccount[]>([]);
  const [transactions, setTransactions] = useState<PersonalTransaction[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [assets, setAssets] = useState<PersonalAsset[]>([]);
  const [liabilities, setLiabilities] = useState<PersonalLiability[]>([]);
  const [goals, setGoals] = useState<PersonalSavingsGoal[]>([]);
  const [budgets, setBudgets] = useState<PersonalBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAccountId, setSelectedAccountId] = useState('All');

  // Modals
  const [showTxModal, setShowTxModal] = useState(false);
  const [showAccModal, setShowAccModal] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showLiabModal, setShowLiabModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);

  // New Transaction Form State
  const [newTx, setNewTx] = useState({
    account_id: '',
    amount: '',
    type: 'expense' as 'income' | 'expense' | 'transfer',
    date: '',
    description: '',
    category: 'Food & Groceries',
    reference: '',
  });

  // New Account Form State
  const [newAcc, setNewAcc] = useState({
    name: '',
    institution: '',
    account_type: 'mobile_money',
    currency: 'KES',
    balance: '',
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

  // Import State
  const [importText, setImportText] = useState('');
  const [importAccountId, setImportAccountId] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    setNewTx((prev) => ({ ...prev, date: new Date().toISOString().split('T')[0] }));
    loadAllData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [netRes, accRes, txRes, expRes, alRes, goalRes] = await Promise.all([
        fetch('/api/networth'),
        fetch('/api/transactions?type=accounts'),
        fetch('/api/transactions?limit=200'),
        fetch('/api/expenses/by_category'),
        fetch('/api/assets-liabilities'),
        fetch('/api/goals'),
      ]);

      if (netRes.ok) {
        const netData = await netRes.json();
        setMetrics(netData);
      }
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData.accounts || []);
        if (accData.accounts?.length > 0 && !importAccountId) {
          setImportAccountId(String(accData.accounts[0].id));
          setNewTx((prev) => ({ ...prev, account_id: String(accData.accounts[0].id) }));
        }
      }
      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
      }
      if (expRes.ok) {
        const expData = await expRes.json();
        setExpenses(expData.expenses || []);
      }
      if (alRes.ok) {
        const alData = await alRes.json();
        setAssets(alData.assets || []);
        setLiabilities(alData.liabilities || []);
      }
      if (goalRes.ok) {
        const gData = await goalRes.json();
        setGoals(gData.goals || []);
        setBudgets(gData.budgets || []);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
      showToast('Error loading financial data');
    } finally {
      setLoading(false);
    }
  };

  // Submit Manual Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTx.amount || !newTx.description || !newTx.account_id) {
      showToast('Please fill all required fields');
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTx),
      });

      if (res.ok) {
        showToast('Transaction added successfully!');
        setShowTxModal(false);
        setNewTx({
          account_id: accounts[0]?.id ? String(accounts[0].id) : '',
          amount: '',
          type: 'expense',
          date: new Date().toISOString().split('T')[0],
          description: '',
          category: 'Food & Groceries',
          reference: '',
        });
        loadAllData();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add transaction');
      }
    } catch {
      showToast('Error connecting to server');
    }
  };

  // Submit New Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAcc.name) {
      showToast('Account name is required');
      return;
    }

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_account',
          ...newAcc,
          balance: parseFloat(newAcc.balance || '0'),
        }),
      });

      if (res.ok) {
        showToast('Account created successfully!');
        setShowAccModal(false);
        setNewAcc({ name: '', institution: '', account_type: 'mobile_money', currency: 'KES', balance: '' });
        loadAllData();
      }
    } catch {
      showToast('Failed to create account');
    }
  };

  // Submit New Asset
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAsset.name || !newAsset.estimated_value) {
      showToast('Please enter asset name and valuation');
      return;
    }

    try {
      const res = await fetch('/api/assets-liabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'asset',
          ...newAsset,
          estimated_value: parseFloat(newAsset.estimated_value),
        }),
      });

      if (res.ok) {
        showToast('Asset added to balance sheet!');
        setShowAssetModal(false);
        setNewAsset({ name: '', category: 'land', estimated_value: '', notes: '' });
        loadAllData();
      }
    } catch {
      showToast('Failed to save asset');
    }
  };

  // Submit New Liability
  const handleCreateLiability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLiab.name || !newLiab.outstanding_balance) {
      showToast('Please enter liability details');
      return;
    }

    try {
      const res = await fetch('/api/assets-liabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'liability',
          ...newLiab,
          principal_amount: parseFloat(newLiab.principal_amount || newLiab.outstanding_balance),
          outstanding_balance: parseFloat(newLiab.outstanding_balance),
          interest_rate: newLiab.interest_rate ? parseFloat(newLiab.interest_rate) : undefined,
          monthly_payment: newLiab.monthly_payment ? parseFloat(newLiab.monthly_payment) : undefined,
        }),
      });

      if (res.ok) {
        showToast('Liability recorded on balance sheet!');
        setShowLiabModal(false);
        setNewLiab({ name: '', creditor: '', category: 'personal_loan', principal_amount: '', outstanding_balance: '', interest_rate: '', monthly_payment: '' });
        loadAllData();
      }
    } catch {
      showToast('Failed to record liability');
    }
  };

  // Submit New Goal
  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.name || !newGoal.target_amount) {
      showToast('Please enter goal name and target amount');
      return;
    }

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newGoal,
          target_amount: parseFloat(newGoal.target_amount),
          current_amount: parseFloat(newGoal.current_amount || '0'),
        }),
      });

      if (res.ok) {
        showToast('Savings goal created!');
        setShowGoalModal(false);
        setNewGoal({ name: '', target_amount: '', current_amount: '', target_date: '' });
        loadAllData();
      }
    } catch {
      showToast('Failed to save goal');
    }
  };

  // Contribute to Goal
  const handleContributeGoal = async (id: string | number, amount: number) => {
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'contribute', id, amount }),
      });
      if (res.ok) {
        showToast(`Contributed ${formatKES(amount)} to goal!`);
        loadAllData();
      }
    } catch {
      showToast('Failed to update goal');
    }
  };

  // Import Statement / SMS
  const handleImportStatement = async (sampleType?: 'sms' | 'csv') => {
    let textToUse = importText;

    if (sampleType === 'sms') {
      textToUse = `QHL921KK89 Confirmed. Ksh3,200.00 sent to NAIVAS WESTLANDS on 22/10/26 at 11:45 AM. New M-PESA balance is Ksh42,850.00.
QHL483JJ22 Confirmed. Ksh1,500.00 paid to KPLC PREPAID.
QHK9902188 Confirmed. You have received Ksh25,000.00 from PETER NJOROGE on 21/10/26.`;
      setImportText(textToUse);
    } else if (sampleType === 'csv') {
      textToUse = `"Receipt No.","Completion Time","Details","Transaction Status","Paid In","Withdrawn","Balance"
"RJL902KL11","2026-10-21 09:30:12","Naivas Supermarket Food","Completed","0.00","4200.00","38650.00"
"RJL482PQ99","2026-10-20 18:14:05","Kenya Power KPLC Tokens","Completed","0.00","2000.00","42850.00"
"RJL110AZ77","2026-10-19 14:00:00","Consulting Retainer Inflow","Completed","50000.00","0.00","44850.00"`;
      setImportText(textToUse);
    }

    if (!textToUse.trim()) {
      showToast('Please paste statement rows or SMS messages');
      return;
    }

    try {
      setImportLoading(true);
      const res = await fetch('/api/import/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: textToUse,
          accountId: importAccountId || (accounts[0] ? accounts[0].id : 1),
          importType: sampleType === 'sms' ? 'sms' : 'statement',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`Successfully imported ${data.count} transactions into ${data.accountName}!`);
        setImportText('');
        loadAllData();
      } else {
        showToast(data.error || 'Failed to parse transactions');
      }
    } catch {
      showToast('Import request error');
    } finally {
      setImportLoading(false);
    }
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchCat = selectedCategory === 'All' || t.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchAcc = selectedAccountId === 'All' || String(t.account_id) === String(selectedAccountId);
      const matchQuery =
        !searchQuery ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.reference && t.reference.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchAcc && matchQuery;
    });
  }, [transactions, selectedCategory, selectedAccountId, searchQuery]);

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
                HisaKenya <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">MVP Personal Wealth</span>
              </h1>
              <p className="text-xs text-slate-400">Personal Net Worth, M-Pesa & Cash Flow Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {metrics?.isDatabaseConnected ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                PostgreSQL Connected
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950/60 text-amber-300 border border-amber-800/80">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                In-Memory Session Mode
              </span>
            )}

            <button
              id="btn-add-tx"
              onClick={() => setShowTxModal(true)}
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
              onClick={() => setActiveTab(tab.id as any)}
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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="h-96 flex flex-col items-center justify-center gap-4 text-slate-400">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Calculating personal wealth balance sheet...</p>
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
                      <span>Kenyan Expense Category Breakdown</span>
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
                              formatter={(value: any) => [formatKES(value), 'Spent']}
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
                    onClick={() => setShowAccModal(true)}
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
                  <button
                    onClick={() => setShowTxModal(true)}
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
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES_LIST.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="All">All Accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={String(a.id)}>{a.name}</option>
                    ))}
                  </select>
                </div>

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
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {filteredTransactions.length > 0 ? (
                          filteredTransactions.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-3 px-4 whitespace-nowrap text-slate-400">{t.date}</td>
                              <td className="py-3 px-4 font-sans font-medium text-white max-w-xs truncate">{t.description}</td>
                              <td className="py-3 px-4 font-sans">
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] text-slate-300">
                                  {t.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-sans text-slate-400">{t.account_name || 'Account'}</td>
                              <td className="py-3 px-4 text-slate-500 text-[11px]">{t.reference || '-'}</td>
                              <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
                                t.type === 'income' ? 'text-emerald-400' : t.type === 'expense' ? 'text-rose-400' : 'text-blue-400'
                              }`}>
                                {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '⇄'} {formatKES(t.amount)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                              No matching transactions found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: M-PESA & CSV STATEMENT IMPORT */}
            {activeTab === 'import' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Import M-Pesa Statements & SMS Messages</h2>
                  <p className="text-xs text-slate-400">
                    Paste Safaricom SMS confirmations or statement text to automatically categorize and import transactions.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Input Form */}
                  <div className="lg:col-span-2 bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">Paste M-Pesa SMS or CSV text:</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleImportStatement('sms')}
                          className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium"
                        >
                          Load Sample SMS
                        </button>
                        <button
                          type="button"
                          onClick={() => handleImportStatement('csv')}
                          className="text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 font-medium"
                        >
                          Load Sample CSV
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={8}
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={`Paste M-Pesa SMS confirmation messages here:\n\nQHL921KK89 Confirmed. Ksh3,200.00 sent to NAIVAS WESTLANDS on 22/10/26 at 11:45 AM...\nQHK9902188 Confirmed. You have received Ksh25,000.00 from PETER NJOROGE on 21/10/26...`}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Target Account to Credit/Debit</label>
                        <select
                          value={importAccountId}
                          onChange={(e) => setImportAccountId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              {a.name} ({formatKES(a.balance)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          disabled={importLoading}
                          onClick={() => handleImportStatement()}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {importLoading ? 'Parsing & Ingesting...' : '📥 Parse & Import Into Account'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right: Explainer */}
                  <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>💡</span> How Import Works
                    </h3>
                    <ul className="text-xs text-slate-300 space-y-3">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>
                          <strong>Zero API dependencies:</strong> No need for Safaricom business paybills or live callbacks to track personal finances.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>
                          <strong>Automatic Categorization:</strong> Identifies KPLC tokens, Naivas groceries, Rubis fuel, and Safaricom fibre automatically.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-400">✓</span>
                        <span>
                          <strong>Duplicate Protection:</strong> Safaricom receipt codes (e.g. <code>QHL921KK89</code>) prevent importing the same transaction twice.
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
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
                      onClick={() => setShowAssetModal(true)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                    >
                      + Add Asset
                    </button>
                    <button
                      onClick={() => setShowLiabModal(true)}
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
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Savings Goals & Monthly Budgets</h2>
                    <p className="text-xs text-slate-400">Target funds for emergency safety, land purchase, and monthly category limits</p>
                  </div>
                  <button
                    onClick={() => setShowGoalModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 self-start"
                  >
                    <span>+</span> New Savings Goal
                  </button>
                </div>

                {/* Savings Goals Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {goals.map((g) => {
                    const percent = Math.min(100, (g.current_amount / g.target_amount) * 100);
                    return (
                      <div
                        key={g.id}
                        className="bg-[#111726] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>🎯 Target: {formatKES(g.target_amount)}</span>
                            <span>{percent.toFixed(0)}%</span>
                          </div>
                          <h3 className="text-sm font-bold text-white mt-1">{g.name}</h3>

                          <div className="w-full bg-slate-800 h-2.5 rounded-full mt-3 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full transition-all"
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>

                          <div className="flex items-center justify-between text-xs mt-3">
                            <span className="text-slate-400">Saved so far:</span>
                            <span className="font-bold text-emerald-400">{formatKES(g.current_amount)}</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-slate-800 flex gap-2">
                          <button
                            onClick={() => handleContributeGoal(g.id, 5000)}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs py-1.5 rounded-lg"
                          >
                            + KSh 5,000
                          </button>
                          <button
                            onClick={() => handleContributeGoal(g.id, 20000)}
                            className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs py-1.5 rounded-lg border border-emerald-500/30"
                          >
                            + KSh 20,000
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Monthly Budgets List */}
                <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
                  <h3 className="text-sm font-bold text-white mb-4">Monthly Spending Limits by Kenyan Category</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {budgets.map((b) => (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold text-slate-200">{b.category}</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {formatKES(b.monthly_limit)} / month
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* MODAL: ADD TRANSACTION */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Record Transaction</h3>
              <button onClick={() => setShowTxModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateTransaction} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Account</label>
                <select
                  value={newTx.account_id}
                  onChange={(e) => setNewTx({ ...newTx, account_id: e.target.value })}
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
                    value={newTx.type}
                    onChange={(e) => setNewTx({ ...newTx, type: e.target.value as any })}
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
                    type="number"
                    required
                    value={newTx.amount}
                    onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                    placeholder="e.g. 2500"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Description / Merchant</label>
                <input
                  type="text"
                  required
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
                    type="date"
                    value={newTx.date}
                    onChange={(e) => setNewTx({ ...newTx, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Reference (M-Pesa / Bank Ref - Optional)</label>
                <input
                  type="text"
                  value={newTx.reference}
                  onChange={(e) => setNewTx({ ...newTx, reference: e.target.value })}
                  placeholder="e.g. QHL921KK89"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                Save Transaction
              </button>
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
              <button onClick={() => setShowAccModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Account Name</label>
                <input
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
                  <label className="text-xs text-slate-400 block mb-1">Starting Balance (KES)</label>
                  <input
                    type="number"
                    value={newAcc.balance}
                    onChange={(e) => setNewAcc({ ...newAcc, balance: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                Create Account
              </button>
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
              <button onClick={() => setShowAssetModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Asset Name</label>
                <input
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
                    value={newAsset.category}
                    onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="land">Land & Plots</option>
                    <option value="real_estate">Real Estate & Houses</option>
                    <option value="vehicle">Motor Vehicle</option>
                    <option value="investments">NSE Stocks / Bonds</option>
                    <option value="valuables">Valuables & Tech</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Valuation (KES)</label>
                  <input
                    type="number"
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
                Save Asset to Balance Sheet
              </button>
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
              <button onClick={() => setShowLiabModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateLiability} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Loan / Liability Name</label>
                <input
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
                    type="number"
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
                    type="number"
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
                Record Liability
              </button>
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
              <button onClick={() => setShowGoalModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Goal Name</label>
                <input
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
                    type="number"
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
                    type="number"
                    value={newGoal.current_amount}
                    onChange={(e) => setNewGoal({ ...newGoal, current_amount: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg mt-3"
              >
                Create Goal
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
