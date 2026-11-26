import { query } from '../db';
import type { Category } from './types';
import { canonicalCategory, KENYAN_EXPENSE_CATEGORIES } from '../categories';

export { KENYAN_EXPENSE_CATEGORIES };

export async function getCategories(userId: number): Promise<Category[]> {
  const result = await query(`
    SELECT name FROM categories
    UNION SELECT category AS name FROM transactions WHERE user_id=$1 AND voided_at IS NULL
    UNION SELECT category AS name FROM budgets WHERE user_id=$1 AND is_active
    ORDER BY name
  `, [userId]);
  const categories = new Map(KENYAN_EXPENSE_CATEGORIES.map((category) => [category.name.toLowerCase(), category]));
  for (const row of result.rows) {
    const name = canonicalCategory(row.name);
    if (!categories.has(name.toLowerCase())) categories.set(name.toLowerCase(), { name, icon: '📦', color: '#94A3B8' });
  }
  return [...categories.values()];
}
