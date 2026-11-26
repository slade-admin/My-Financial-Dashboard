import type { Category } from './repo/types';

export const KENYAN_EXPENSE_CATEGORIES: Category[] = [
  { name: 'Food & Groceries', icon: '🛒', color: '#F87171' },
  { name: 'Rent & Housing', icon: '🏠', color: '#818CF8' },
  { name: 'Utilities & Water (KPLC)', icon: '💡', color: '#FBBF24' },
  { name: 'Airtime & Internet (Safaricom)', icon: '📶', color: '#34D399' },
  { name: 'Transport & Fuel (Matatu/Petrol)', icon: '⛽', color: '#60A5FA' },
  { name: 'Family & Chamas', icon: '🤝', color: '#F472B6' },
  { name: 'Shopping & Essentials', icon: '🛍️', color: '#A78BFA' },
  { name: 'Healthcare & Pharmacy', icon: '🏥', color: '#FB7185' },
  { name: 'Education & School Fees', icon: '📚', color: '#38BDF8' },
  { name: 'Entertainment & Dining', icon: '🎬', color: '#E879F9' },
  { name: 'Salary & Primary Income', icon: '💰', color: '#10B981' },
  { name: 'Side Hustle & Consulting', icon: '💼', color: '#059669' },
  { name: 'Transfers & Remittance', icon: '🔄', color: '#9CA3AF' },
  { name: 'Savings & MMF Deposit', icon: '📈', color: '#6366F1' },
  { name: 'Loan & Fuliza Repayment', icon: '🏛️', color: '#EF4444' },
  { name: 'Transaction Fees', icon: '🧾', color: '#F59E0B' },
  { name: 'Balance Reconciliation', icon: '⚖️', color: '#94A3B8' },
  { name: 'Other', icon: '📦', color: '#6B7280' },
];

export const CATEGORY_ALIASES: Record<string, string> = {
  'Utilities (KPLC/Water)': 'Utilities & Water (KPLC)',
  'Airtime & Internet': 'Airtime & Internet (Safaricom)',
  'Transport & Fuel': 'Transport & Fuel (Matatu/Petrol)',
  Shopping: 'Shopping & Essentials',
  Healthcare: 'Healthcare & Pharmacy',
  'Education & Fees': 'Education & School Fees',
  Entertainment: 'Entertainment & Dining',
  'Salary & Income': 'Salary & Primary Income',
  'Freelance & Business': 'Side Hustle & Consulting',
  Transfers: 'Transfers & Remittance',
  'Savings & Investment': 'Savings & MMF Deposit',
  'Debt Repayment': 'Loan & Fuliza Repayment',
};

export function canonicalCategory(value: string): string {
  const name = value.trim();
  const alias = Object.entries(CATEGORY_ALIASES).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return alias?.[1] || KENYAN_EXPENSE_CATEGORIES.find((c) => c.name.toLowerCase() === name.toLowerCase())?.name || name;
}
