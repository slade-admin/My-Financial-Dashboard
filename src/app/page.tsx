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

interface ExpenseCategory {
  category: string;
  icon: string;
  color: string;
  total_amount: number;
  transaction_count: number;
}

interface DashboardTransaction {
  id: number | string;
  account_id?: number | string;
  source_rail: 'MPESA_DARAJA' | 'EQUITY_JENGA' | 'KCB_BUNI' | 'COOP_BANK' | 'STANCHART' | 'PAYPAL';
  rail_reference: string;
  amount: number;
  currency: string;
  date: string;
  merchant_or_party: string;
  category: string;
  payment_channel?: string;
  type: 'debit' | 'credit';
  balance_after?: number;
  etims_status?: 'UNFISCALIZED' | 'FISCALIZED' | 'EXEMPT';
  etims_invoice_id?: string;
  vat_amount?: number;
  is_reconciled?: boolean;
}

interface DashboardAccount {
  id: number | string;
  institution_code: string;
  institution_name: string;
  account_number_mask: string;
  account_type: string;
  currency: string;
  balance: number;
  created_at: string;
}

interface PortfolioHolding {
  id: number;
  assetType: string;
  institution: string;
  name: string;
  principal: number;
  valuation: number;
  accruedInterest: number;
  annualYieldPercent: number;
  maturityDate?: string;
  isTaxExempt: boolean;
}

interface EtimsInvoice {
  invoiceId: string;
  cuin: string;
  fiscalReceiptNumber: string;
  invoiceDate: string;
  taxableAmount: number;
  vatAmount: number;
  grandTotal: number;
  qrCodeUrl: string;
  vscuStatus: string;
}

// Format Kenyan Shilling
const formatKES = (val: number | string) => {
  const num = typeof val === 'number' ? val : parseFloat(String(val) || '0');
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace('KES', 'KSh');
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'overview' | 'mpesa' | 'banks' | 'checkout' | 'etims' | 'wealth' | 'advisor'>('overview');
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [etimsInvoices, setEtimsInvoices] = useState<EtimsInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [railFilter, setRailFilter] = useState('All');

  // M-Pesa STK Push Form State
  const [stkPhone, setStkPhone] = useState('0712345678');
  const [stkAmount, setStkAmount] = useState('1500');
  const [stkRef, setStkRef] = useState('Invoice902');
  const [stkLoading, setStkLoading] = useState(false);

  // Unified Checkout Form State
  const [checkoutAmount, setCheckoutAmount] = useState('50');
  const [checkoutCurrency, setCheckoutCurrency] = useState<'USD' | 'KES'>('USD');
  const [checkoutProvider, setCheckoutProvider] = useState<'paypal' | 'mpesa_express' | 'pesapal'>('paypal');
  const [checkoutResult, setCheckoutResult] = useState<any>(null);

  // Advisor Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'advisor'; text: string; tips?: string[] }>>([
    {
      sender: 'advisor',
      text: 'Jambo! I am your Kenyan AI Financial Advisor. I monitor your Safaricom M-Pesa cash flows, direct bank balances (Equity, KCB, Co-op, StanChart), KRA eTIMS tax compliance, and CBK Treasury Bill/Bond yield allocations. How can I guide you today?',
      tips: [
        'Ask: "How do I optimize my KRA eTIMS tax liability this month?"',
        'Ask: "Should I keep funds in M-Pesa, MMF or 91-Day CBK Treasury Bills?"',
        'Ask: "What is my PayPal USD remittance exposure to KES?"',
      ],
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [accRes, txRes, expRes, wealthRes, etimsRes] = await Promise.all([
        fetch('/api/transactions?type=accounts'),
        fetch('/api/transactions'),
        fetch('/api/expenses/by_category'),
        fetch('/api/wealth/portfolio'),
        fetch('/api/compliance/etims'),
      ]);

      if (txRes.ok) {
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
      }
      if (expRes.ok) {
        const expData = await expRes.json();
        setExpenses(expData.categories || []);
      }
      if (wealthRes.ok) {
        const wData = await wealthRes.json();
        setHoldings(wData.holdings || []);
      }
      if (etimsRes.ok) {
        const etData = await etimsRes.json();
        setEtimsInvoices(etData.invoices || []);
      }

      // Default mock accounts if not yet saved in DB
      setAccounts([
        {
          id: 1,
          institution_code: 'SAFARICOM',
          institution_name: 'M-Pesa Business Till & Paybill',
          account_number_mask: 'Till: 889021',
          account_type: 'M-Pesa Paybill / Till',
          currency: 'KES',
          balance: 145800.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          institution_code: 'EQUITY',
          institution_name: 'Equity Bank Kenya (Jenga Connect)',
          account_number_mask: '****4819',
          account_type: 'Current / Checking',
          currency: 'KES',
          balance: 485200.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 3,
          institution_code: 'KCB',
          institution_name: 'KCB Bank Kenya (Buni API)',
          account_number_mask: '****9102',
          account_type: 'Savings',
          currency: 'KES',
          balance: 210000.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 4,
          institution_code: 'COOP',
          institution_name: 'Co-operative Bank of Kenya',
          account_number_mask: '****3321',
          account_type: 'Current / Checking',
          currency: 'KES',
          balance: 95400.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 5,
          institution_code: 'SCB',
          institution_name: 'Standard Chartered Kenya',
          account_number_mask: '****6541',
          account_type: 'Current / Checking',
          currency: 'KES',
          balance: 320000.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 6,
          institution_code: 'PAYPAL',
          institution_name: 'PayPal USD Remittance Wallet',
          account_number_mask: 'wanjiku@paypal.com',
          account_type: 'PayPal Balance',
          currency: 'USD',
          balance: 2450.0,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Trigger Daraja STK Push
  const handleInitiateSTK = async (e: React.FormEvent) => {
    e.preventDefault();
    setStkLoading(true);
    try {
      const res = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: stkPhone,
          amount: parseFloat(stkAmount),
          accountReference: stkRef,
          transactionDesc: 'Dashboard Topup',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(`📲 STK Push Sent! Prompt delivered to ${stkPhone}.`);
        // Simulate real-time callback ingestion after 3 seconds
        setTimeout(async () => {
          await fetch('/api/mpesa/c2b/confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              TransactionType: 'CustomerPayBillOnline',
              TransID: 'RJL' + Math.floor(1000000 + Math.random() * 9000000),
              TransTime: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
              TransAmount: parseFloat(stkAmount),
              BusinessShortCode: '174379',
              BillRefNumber: stkRef,
              MSISDN: stkPhone,
              FirstName: 'Simulated',
              LastName: 'User',
            }),
          });
          fetchDashboardData();
          showToast(`✅ M-Pesa Payment Confirmed! Transaction credited in real time.`);
        }, 3000);
      } else {
        showToast(`❌ Error: ${data.error || 'Failed to trigger STK'}`);
      }
    } catch (err: any) {
      showToast(`❌ STK Request Failed: ${err.message}`);
    } finally {
      setStkLoading(false);
    }
  };

  // Trigger Unified Checkout
  const handleCreateCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(checkoutAmount),
          currency: checkoutCurrency,
          provider: checkoutProvider,
          description: 'Personal Remittance / Payment Intent',
          customerEmail: 'wanjiku@digitalbiz.co.ke',
        }),
      });
      const data = await res.json();
      setCheckoutResult(data);
      showToast(`⚡ Checkout Session initialized via ${data.provider.toUpperCase()}`);
    } catch (err: any) {
      showToast(`❌ Checkout Error: ${err.message}`);
    }
  };

  // Trigger KRA eTIMS Batch Fiscalization
  const handleFiscalizeAll = async () => {
    try {
      const unfiscalized = transactions.filter((t) => t.etims_status === 'UNFISCALIZED');
      if (unfiscalized.length === 0) {
        showToast('ℹ️ All commercial transactions are already eTIMS fiscalized!');
        return;
      }

      for (const t of unfiscalized) {
        await fetch('/api/compliance/etims', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taxpayerKraPin: 'P051234567Z',
            customerName: t.merchant_or_party,
            amount: t.currency === 'USD' ? t.amount * 130.5 : t.amount,
            transactionId: t.id,
          }),
        });
      }

      showToast(`✅ Successfully fiscalized ${unfiscalized.length} transactions with KRA eTIMS!`);
      fetchDashboardData();
    } catch (err: any) {
      showToast(`❌ eTIMS Fiscalization Error: ${err.message}`);
    }
  };

  // Trigger AI Advisor Chat
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: 'advisor',
            text: `${data.analysis}\n\n${data.recommendations?.join('\n') || ''}`,
            tips: data.tips,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { sender: 'advisor', text: 'Error connecting to Simba Advisory service. Please try again.' },
        ]);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { sender: 'advisor', text: `Failed to fetch advice: ${err.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Direct Bank Sync simulation
  const handleSyncBank = async (bankCode: string) => {
    showToast(`🔄 Pulling live statements from ${bankCode}...`);
    try {
      const res = await fetch('/api/banks/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankCode, accountMask: '****9988' }),
      });
      if (res.ok) {
        showToast(`✅ Live statements & balances synced from ${bankCode}!`);
        fetchDashboardData();
      }
    } catch (err: any) {
      showToast(`❌ Bank Sync Error: ${err.message}`);
    }
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.merchant_or_party.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.rail_reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'All' || t.category === selectedCategory;
      const matchesRail = railFilter === 'All' || t.source_rail === railFilter;

      return matchesSearch && matchesCat && matchesRail;
    });
  }, [transactions, searchQuery, selectedCategory, railFilter]);

  // Aggregate stats
  const totalBalanceKes = useMemo(() => {
    return accounts.reduce((acc, a) => {
      const val = a.currency === 'USD' ? a.balance * 130.5 : a.balance;
      return acc + val;
    }, 0);
  }, [accounts]);

  const totalInvestedKes = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.valuation, 0);
  }, [holdings]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/40 animate-bounce">
          <span className="text-xl">🔔</span>
          <span className="font-semibold text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-green-600 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 font-bold text-white">
            🇰🇪
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Kenya Unified Financial Dashboard
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Native Rails
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Safaricom Daraja 2.0 • Direct Bank Gateways • PayPal • KRA eTIMS • CBK Wealth
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/60 overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'overview' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            📊 Overview
          </button>
          <button
            onClick={() => setActiveTab('mpesa')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'mpesa' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            M-Pesa Daraja
          </button>
          <button
            onClick={() => setActiveTab('banks')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'banks' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            🏦 Direct Banks
          </button>
          <button
            onClick={() => setActiveTab('checkout')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'checkout' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            💳 Checkout & PayPal
          </button>
          <button
            onClick={() => setActiveTab('etims')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'etims' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            🏛️ KRA eTIMS
          </button>
          <button
            onClick={() => setActiveTab('wealth')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'wealth' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            📈 Wealth & Bonds
          </button>
          <button
            onClick={() => setActiveTab('advisor')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              activeTab === 'advisor' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            🤖 AI Advisor
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* KPI Header Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Liquid Cash</p>
            <h2 className="text-2xl font-bold text-white mt-1">{formatKES(totalBalanceKes)}</h2>
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
              <span>●</span> 6 Accounts Active (M-Pesa, Banks, PayPal)
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">CBK Wealth & Investments</p>
            <h2 className="text-2xl font-bold text-white mt-1">{formatKES(totalInvestedKes)}</h2>
            <p className="text-xs text-blue-400 mt-2 flex items-center gap-1">
              <span>●</span> Weighted Yield ~15.2% (T-Bills & IFB)
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none"></div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">M-Pesa Inflow (30d)</p>
            <h2 className="text-2xl font-bold text-white mt-1">{formatKES(145800)}</h2>
            <p className="text-xs text-purple-400 mt-2 flex items-center gap-1">
              <span>●</span> Daraja Real-time C2B Push
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">KRA eTIMS Fiscal Status</p>
            <h2 className="text-2xl font-bold text-white mt-1">
              {transactions.filter((t) => t.etims_status === 'FISCALIZED').length} / {transactions.length}
            </h2>
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <span>●</span> VSCU / OSCU Compliant
            </p>
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Account Rails Grid */}
            <div>
              <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                <span>🏦</span> Connected Financial Rails (Kenya Native)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl hover:border-emerald-500/40 transition"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-emerald-400">{acc.institution_code}</span>
                      <span>{acc.currency}</span>
                    </div>
                    <div className="text-sm font-medium text-white truncate">{acc.institution_name}</div>
                    <div className="text-xs text-slate-500 mb-2">{acc.account_number_mask}</div>
                    <div className="text-base font-bold text-slate-100">
                      {acc.currency === 'USD' ? `$${acc.balance.toLocaleString()}` : formatKES(acc.balance)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Breakdown */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl lg:col-span-1">
                <h3 className="text-base font-bold text-white mb-1">Spending by Category</h3>
                <p className="text-xs text-slate-400 mb-4">Intelligently categorized for Kenyan merchants</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenses}
                        dataKey="total_amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                      >
                        {expenses.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [formatKES(val), 'Spent']}
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-2 max-h-40 overflow-y-auto text-xs">
                  {expenses.map((e) => (
                    <div key={e.category} className="flex items-center justify-between py-1 border-b border-slate-800/60">
                      <div className="flex items-center gap-2 truncate">
                        <span>{e.icon}</span>
                        <span className="text-slate-300 truncate">{e.category}</span>
                      </div>
                      <span className="font-semibold text-white">{formatKES(e.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transactions Feed */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl lg:col-span-2 flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Unified Transactions Feed</h3>
                    <p className="text-xs text-slate-400">Live feed across M-Pesa, Equity, KCB, Co-op & PayPal</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-slate-800 text-xs px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500 text-white"
                    />
                    <select
                      value={railFilter}
                      onChange={(e) => setRailFilter(e.target.value)}
                      className="bg-slate-800 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-white"
                    >
                      <option value="All">All Rails</option>
                      <option value="MPESA_DARAJA">M-Pesa</option>
                      <option value="EQUITY_JENGA">Equity Jenga</option>
                      <option value="KCB_BUNI">KCB Buni</option>
                      <option value="PAYPAL">PayPal</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-2">Date / Ref</th>
                        <th className="pb-2">Rail</th>
                        <th className="pb-2">Merchant / Party</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2 text-center">eTIMS Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5">
                            <div className="font-semibold text-white">{tx.date}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{tx.rail_reference}</div>
                          </td>
                          <td className="py-2.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                              {tx.source_rail.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <div className="text-slate-200 font-medium">{tx.merchant_or_party}</div>
                            <div className="text-[10px] text-slate-500">{tx.payment_channel}</div>
                          </td>
                          <td className="py-2.5 text-slate-300">{tx.category}</td>
                          <td
                            className={`py-2.5 text-right font-bold ${
                              tx.type === 'credit' ? 'text-emerald-400' : 'text-slate-200'
                            }`}
                          >
                            {tx.type === 'credit' ? '+' : '-'}
                            {tx.currency === 'USD' ? `$${tx.amount.toFixed(2)}` : formatKES(tx.amount)}
                          </td>
                          <td className="py-2.5 text-center">
                            {tx.etims_status === 'FISCALIZED' ? (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                                ✓ Fiscalized
                              </span>
                            ) : tx.etims_status === 'EXEMPT' ? (
                              <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                                Exempt
                              </span>
                            ) : (
                              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                                Pending Sync
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SAFARICOM M-PESA DARAJA 2.0 */}
        {activeTab === 'mpesa' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                  📲
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Lipa Na M-Pesa Online (STK Push)</h3>
                  <p className="text-xs text-slate-400">Trigger real-time STK prompts directly to phone</p>
                </div>
              </div>

              <form onSubmit={handleInitiateSTK} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Customer Phone Number (Safaricom)
                  </label>
                  <input
                    type="text"
                    value={stkPhone}
                    onChange={(e) => setStkPhone(e.target.value)}
                    placeholder="2547XXXXXXXX or 07XXXXXXXX"
                    className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <span className="text-[10px] text-slate-500">Supports standard Kenyan formats (07XX / 01XX / 2547XX)</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Amount (KES)</label>
                  <input
                    type="number"
                    value={stkAmount}
                    onChange={(e) => setStkAmount(e.target.value)}
                    placeholder="Amount in KES"
                    className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Account Reference / Bill Number</label>
                  <input
                    type="text"
                    value={stkRef}
                    onChange={(e) => setStkRef(e.target.value)}
                    placeholder="e.g. Inv001"
                    className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={stkLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
                >
                  {stkLoading ? (
                    <span>Sending Prompt to Handset...</span>
                  ) : (
                    <>
                      <span>📱</span> Send M-Pesa STK Push
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  <span>⚡</span> Daraja 2.0 Webhook Architecture
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Endpoints actively listening for Safaricom IPN callbacks:
                </p>
                <div className="space-y-3">
                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-emerald-400">STK Push Callback Receiver</span>
                      <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">POST</span>
                    </div>
                    <code className="text-[11px] text-slate-300">/api/mpesa/callback</code>
                  </div>

                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-emerald-400">C2B Instant Confirmation Endpoint</span>
                      <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">POST</span>
                    </div>
                    <code className="text-[11px] text-slate-300">/api/mpesa/c2b/confirmation</code>
                  </div>

                  <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-emerald-400">C2B Real-time Validation Gate</span>
                      <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">POST</span>
                    </div>
                    <code className="text-[11px] text-slate-300">/api/mpesa/c2b/validation</code>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300">
                💡 <strong>Why M-Pesa Daraja:</strong> Safaricom processes over 90% of local peer-to-peer and merchant payments. Real-time C2B callbacks eliminate end-of-day statement reconciliation delays!
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DIRECT KENYAN BANKS */}
        {activeTab === 'banks' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Kenyan Direct Banking Gateway</h3>
              <p className="text-xs text-slate-400">Direct API integration via Open Banking & Pesalink switch</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  code: 'EQUITY_KE',
                  name: 'Equity Bank Kenya',
                  api: 'Jenga API v3 (Finserve)',
                  desc: 'Account Inquiry, Mini-Statements, Pesalink Transfers, EazzyPay',
                  color: 'border-red-500/40 bg-red-950/10',
                  badge: 'bg-red-500/20 text-red-400',
                },
                {
                  code: 'KCB_KE',
                  name: 'KCB Bank Kenya',
                  api: 'KCB Buni Open Banking',
                  desc: 'Real-time statement feeds, balance inquiries, and direct bank transfers',
                  color: 'border-green-500/40 bg-green-950/10',
                  badge: 'bg-green-500/20 text-green-400',
                },
                {
                  code: 'COOP_KE',
                  name: 'Co-operative Bank',
                  api: 'Co-op Open Banking Portal',
                  desc: 'MCo-op Cash sync, Pesalink switches, and internal corporate transfers',
                  color: 'border-emerald-500/40 bg-emerald-950/10',
                  badge: 'bg-emerald-500/20 text-emerald-400',
                },
                {
                  code: 'SCB_KE',
                  name: 'Standard Chartered',
                  api: 'Straight2Bank (S2B) API',
                  desc: 'Corporate RTGS, multi-currency accounts, and automated FX treasury',
                  color: 'border-blue-500/40 bg-blue-950/10',
                  badge: 'bg-blue-500/20 text-blue-400',
                },
              ].map((bank) => (
                <div key={bank.code} className={`p-5 rounded-2xl border ${bank.color} flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bank.badge}`}>
                        {bank.api}
                      </span>
                      <span className="text-xs text-emerald-400 flex items-center gap-1">● Live</span>
                    </div>
                    <h4 className="font-bold text-white text-base mb-1">{bank.name}</h4>
                    <p className="text-xs text-slate-400 mb-4">{bank.desc}</p>
                  </div>
                  <button
                    onClick={() => handleSyncBank(bank.code)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 rounded-xl transition border border-slate-700 flex items-center justify-center gap-1.5"
                  >
                    <span>🔄</span> Pull Live Statements
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <span>🔄</span> Pesalink Real-Time Interbank Rail Status
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pesalink provides instant 24/7 bank-to-bank switching under the Kenya Bankers Association (KBA) and Central Bank of Kenya. Transfers between Equity, KCB, Co-op, and Standard Chartered clear within 5 seconds without manual intervention.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: UNIFIED CHECKOUT & PAYPAL */}
        {activeTab === 'checkout' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-lg font-bold text-white mb-1">Unified Checkout & Remittance</h3>
              <p className="text-xs text-slate-400 mb-4">
                Receive PayPal USD remittances or card payments settled directly into KES
              </p>

              <form onSubmit={handleCreateCheckout} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Payment Provider / Rail</label>
                  <select
                    value={checkoutProvider}
                    onChange={(e: any) => setCheckoutProvider(e.target.value)}
                    className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="paypal">PayPal (Orders v2 / International USD)</option>
                    <option value="mpesa_express">M-Pesa Express (Local Mobile Money)</option>
                    <option value="pesapal">Pesapal (Visa / Mastercard / Amex Aggregator)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Amount</label>
                    <input
                      type="number"
                      value={checkoutAmount}
                      onChange={(e) => setCheckoutAmount(e.target.value)}
                      className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Currency</label>
                    <select
                      value={checkoutCurrency}
                      onChange={(e: any) => setCheckoutCurrency(e.target.value)}
                      className="w-full bg-slate-800 text-sm px-4 py-2.5 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="KES">KES (KSh)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30"
                >
                  <span>⚡</span> Initialize Unified Checkout
                </button>
              </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between">
              {checkoutResult ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Order ID:</span>
                    <span className="text-xs font-mono text-emerald-400">{checkoutResult.orderId}</span>
                  </div>
                  <div className="bg-slate-800 p-4 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Amount:</span>
                      <span className="font-bold text-white">
                        {checkoutResult.currency} {checkoutResult.amount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Settled KES:</span>
                      <span className="font-bold text-emerald-400">
                        {formatKES(checkoutResult.settledAmountKes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">FX Conversion Rate:</span>
                      <span className="font-mono text-slate-300">1 USD = {checkoutResult.fxRate} KES</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{checkoutResult.checkoutInstructions}</p>
                  {checkoutResult.paymentUrl && (
                    <a
                      href={checkoutResult.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block w-full text-center bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold py-2.5 rounded-xl border border-emerald-500/30 text-xs"
                    >
                      Simulate Provider Approval Gateway ↗
                    </a>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs">
                  Fill out the checkout form to preview the unified aggregator intent and live FX conversion.
                </div>
              )}

              <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
                💰 <strong>Freelance & Upwork Ready:</strong> Ideal for Kenyan software engineers, writers, and digital agencies receiving payments via PayPal or Stripe, settling into Kenyan commercial banks.
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: KRA eTIMS TAX COMPLIANCE */}
        {activeTab === 'etims' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">KRA eTIMS Fiscal Compliance & Accounting Sync</h3>
                <p className="text-xs text-slate-400">
                  Virtual Sales Control Unit (VSCU) & Online Sales Control Unit (OSCU) sync
                </p>
              </div>
              <button
                onClick={handleFiscalizeAll}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-600/30"
              >
                <span>📜</span> 1-Click Batch Fiscalize Inflows
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-white">Fiscal Invoices Issued with KRA CUIN</span>
                <span className="text-xs text-slate-400">{etimsInvoices.length} Registered</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                      <th className="p-3">CUIN (Control Unit Invoice #)</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Taxable Amount</th>
                      <th className="p-3 text-right">16% VAT</th>
                      <th className="p-3 text-right">Grand Total</th>
                      <th className="p-3 text-center">Verification URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {etimsInvoices.map((inv) => (
                      <tr key={inv.cuin} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-mono font-bold text-emerald-400">{inv.cuin}</td>
                        <td className="p-3 text-slate-300">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                        <td className="p-3 text-right text-slate-300">{formatKES(inv.taxableAmount)}</td>
                        <td className="p-3 text-right text-amber-400 font-semibold">{formatKES(inv.vatAmount)}</td>
                        <td className="p-3 text-right font-bold text-white">{formatKES(inv.grandTotal)}</td>
                        <td className="p-3 text-center">
                          <a
                            href={inv.qrCodeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-1 rounded-md border border-slate-700"
                          >
                            Inspect KRA QR Code ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: WEALTH & CBK BONDS */}
        {activeTab === 'wealth' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Central Bank of Kenya (CBK) Wealth & Investments</h3>
              <p className="text-xs text-slate-400">
                Treasury Bills, Infrastructure Bonds (IFB), Money Market Funds & NSE Equities
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {holdings.map((h) => (
                <div key={h.id} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-blue-400">{h.assetType}</span>
                      {h.isTaxExempt && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Tax Free
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-white text-sm mb-1">{h.name}</h4>
                    <p className="text-xs text-slate-500 mb-3">{h.institution}</p>
                    <div className="text-xl font-bold text-white">{formatKES(h.valuation)}</div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 text-xs flex justify-between items-center">
                    <span className="text-slate-400">Annualized Yield:</span>
                    <span className="font-bold text-emerald-400">{h.annualYieldPercent}%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
              <h4 className="text-sm font-bold text-white mb-2">12-Month Yield Projection</h4>
              <p className="text-xs text-slate-400 mb-4">
                Simulated net returns accounting for Kenya's 15% withholding tax on interest (IFBs are 100% tax exempt)
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holdings}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip
                      formatter={(val: any) => [formatKES(val), 'Valuation']}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    />
                    <Bar dataKey="valuation" fill="#10B981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: AI FINANCIAL ADVISOR */}
        {activeTab === 'advisor' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col h-[650px]">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center text-xl font-bold">
                🦁
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Simba AI Kenya Financial Advisor</h3>
                <p className="text-xs text-slate-400">
                  Real-time guidance on M-Pesa cash flow, KRA eTIMS tax optimization, and CBK Treasury yields
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-2xl px-4 py-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.tips && msg.tips.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.tips.map((tip, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-500/20 px-3 py-1.5 rounded-lg"
                        >
                          {tip}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Simba AI is synthesizing your financial data...
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="mt-4 pt-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask Simba AI (e.g. 'How can I save on KRA taxes using eTIMS?' or 'Where should I park my M-Pesa surplus?')..."
                className="flex-1 bg-slate-800 text-xs px-4 py-3 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl text-xs transition"
              >
                Send
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
