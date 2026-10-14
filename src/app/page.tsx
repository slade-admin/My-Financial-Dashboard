'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [expensesRes, transactionsRes] = await Promise.all([
        fetch('/api/expenses/by_category'),
        fetch('/api/transactions'),
      ]);

      const expensesData = await expensesRes.json();
      const transactionsData = await transactionsRes.json();

      setExpenses(expensesData.expenses || []);
      setTransactions(transactionsData.transactions || []);

      const total = (expensesData.expenses || []).reduce(
        (sum: number, item: any) => sum + parseFloat(item.total_amount),
        0
      );
      setTotalSpent(total);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectBank = async () => {
    try {
      const response = await fetch('/api/plaid/create_link_token', {
        method: 'POST',
      });
      const data = await response.json();

      // In a real app, you would use Plaid Link here
      alert('Link token: ' + data.link_token);
      console.log('Link token:', data.link_token);
    } catch (error) {
      console.error('Error connecting bank:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Finance Dashboard</h1>
          <button
            onClick={handleConnectBank}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Connect Bank Account
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-gray-500 text-sm font-medium">Total Spent (30 days)</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              ${totalSpent.toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-gray-500 text-sm font-medium">Transactions</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {transactions.length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-gray-500 text-sm font-medium">Categories</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {expenses.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Spending by Category</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenses}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.icon} ${entry.category}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="total_amount"
                >
                  {expenses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Category Breakdown</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenses}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
                <Bar dataKey="total_amount" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Merchant</th>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-right py-3 px-4">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((transaction) => (
                  <tr key={transaction.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">{new Date(transaction.date).toLocaleDateString()}</td>
                    <td className="py-3 px-4">{transaction.merchant_name || 'Unknown'}</td>
                    <td className="py-3 px-4">{transaction.category || 'Other'}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      ${parseFloat(transaction.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
