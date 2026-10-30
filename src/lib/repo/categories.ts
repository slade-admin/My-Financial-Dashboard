import { query } from '../db';
import { Category } from './types';

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
  { name: 'Other', icon: '📦', color: '#6B7280' },
];

export async function getCategories(): Promise<Category[]> {
  try {
    const res = await query('SELECT * FROM categories ORDER BY id ASC');
    if (res.rows.length > 0) {
      return res.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        icon: r.icon || '📦',
        color: r.color || '#94A3B8',
      }));
    }
  } catch {
    // If categories table is not yet queried or offline, return default categories
  }
  return KENYAN_EXPENSE_CATEGORIES;
}
