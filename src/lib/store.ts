import { query } from './db';
import { currentUserId } from './session';
import * as repo from './repo';

export * from './repo/types';
export { KENYAN_EXPENSE_CATEGORIES } from './repo/categories';

// Helper to check if DB is configured and accessible. Throws on error.
export async function isDbConnected(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }
  const res = await query('SELECT 1');
  return !!res;
}

// ----------------- ACCOUNTS -----------------
export async function getAccounts(): Promise<repo.PersonalAccount[]> {
  return repo.getAccounts(currentUserId());
}

export async function addAccount(
  account: Omit<repo.PersonalAccount, 'id'>
): Promise<repo.PersonalAccount> {
  return repo.addAccount(currentUserId(), account);
}

// ----------------- TRANSACTIONS -----------------
export async function getTransactions(
  filters?: repo.TransactionFilters
): Promise<repo.PersonalTransaction[]> {
  return repo.getTransactions(currentUserId(), filters);
}

export async function addTransaction(
  tx: Omit<repo.PersonalTransaction, 'id'>
): Promise<repo.PersonalTransaction> {
  const result = await repo.addTransaction(currentUserId(), tx);
  return result.transaction;
}

export async function addTransactionWithStatus(
  tx: Omit<repo.PersonalTransaction, 'id'>
): Promise<repo.AddTransactionResult> {
  return repo.addTransaction(currentUserId(), tx);
}

// ----------------- ASSETS & LIABILITIES -----------------
export async function getAssets(): Promise<repo.PersonalAsset[]> {
  return repo.getAssets(currentUserId());
}

export async function addAsset(
  asset: Omit<repo.PersonalAsset, 'id'>
): Promise<repo.PersonalAsset> {
  return repo.addAsset(currentUserId(), asset);
}

export async function getLiabilities(): Promise<repo.PersonalLiability[]> {
  return repo.getLiabilities(currentUserId());
}

export async function addLiability(
  liability: Omit<repo.PersonalLiability, 'id'>
): Promise<repo.PersonalLiability> {
  return repo.addLiability(currentUserId(), liability);
}

// ----------------- BUDGETS & GOALS -----------------
export async function getBudgets(): Promise<repo.PersonalBudget[]> {
  return repo.getBudgets(currentUserId());
}

export async function getSavingsGoals(): Promise<repo.PersonalSavingsGoal[]> {
  return repo.getSavingsGoals(currentUserId());
}

export async function addSavingsGoal(
  goal: Omit<repo.PersonalSavingsGoal, 'id'>
): Promise<repo.PersonalSavingsGoal> {
  return repo.addSavingsGoal(currentUserId(), goal);
}

export async function updateSavingsGoal(
  id: string | number,
  amountToAdd: number
): Promise<repo.PersonalSavingsGoal | null> {
  return repo.updateSavingsGoal(currentUserId(), id, amountToAdd);
}

// ----------------- NET WORTH & CASH FLOW -----------------
export async function getNetWorthMetrics(): Promise<repo.NetWorthMetrics> {
  return repo.getNetWorthMetrics(currentUserId());
}

export async function getExpensesByCategory(): Promise<repo.ExpenseByCategory[]> {
  return repo.getExpensesByCategory(currentUserId());
}

// ----------------- M-PESA & STATEMENT PARSING -----------------
export interface ParsedImportRow {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  reference?: string;
  category: string;
}

export function parseMpesaStatementText(rawText: string): ParsedImportRow[] {
  const lines = rawText.split('\n');
  const results: ParsedImportRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line is CSV
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map((p) => p.replace(/"/g, '').trim());
      if (parts.length >= 6 && parts[0] !== 'Receipt No.' && parts[0].length >= 8) {
        const ref = parts[0];
        const dateRaw = parts[1] || new Date().toISOString().split('T')[0];
        const details = parts[2] || 'M-Pesa Transaction';
        const paidIn = parseFloat(parts[4] || '0');
        const withdrawn = parseFloat(parts[5] || '0');

        let amount = 0;
        let type: 'income' | 'expense' = 'expense';
        if (paidIn > 0) {
          amount = paidIn;
          type = 'income';
        } else if (withdrawn > 0) {
          amount = withdrawn;
          type = 'expense';
        }

        if (amount > 0) {
          results.push({
            reference: ref,
            date: dateRaw.slice(0, 10),
            description: details,
            amount: repo.toMoney(amount),
            type,
            category: categorizeKenyanDescription(details),
          });
          continue;
        }
      }
    }

    // Try parsing SMS text
    const smsSentMatch = trimmed.match(
      /([A-Z0-9]{10})\s+Confirmed\.\s+Ksh([0-9,.]+)\s+sent\s+to\s+([^on]+)\s+on\s+([0-9/]+)/i
    );
    if (smsSentMatch) {
      results.push({
        reference: smsSentMatch[1],
        amount: repo.toMoney(parseFloat(smsSentMatch[2].replace(/,/g, ''))),
        description: `Sent to ${smsSentMatch[3].trim()}`,
        type: 'expense',
        date: formatDateKenyan(smsSentMatch[4]),
        category: categorizeKenyanDescription(smsSentMatch[3]),
      });
      continue;
    }

    const smsReceivedMatch = trimmed.match(
      /([A-Z0-9]{10})\s+Confirmed\.\s+You\s+have\s+received\s+Ksh([0-9,.]+)\s+from\s+([^on]+)\s+on\s+([0-9/]+)/i
    );
    if (smsReceivedMatch) {
      results.push({
        reference: smsReceivedMatch[1],
        amount: repo.toMoney(parseFloat(smsReceivedMatch[2].replace(/,/g, ''))),
        description: `Received from ${smsReceivedMatch[3].trim()}`,
        type: 'income',
        date: formatDateKenyan(smsReceivedMatch[4]),
        category: 'Salary & Primary Income',
      });
      continue;
    }

    const paybillMatch = trimmed.match(
      /([A-Z0-9]{10})\s+Confirmed\.\s+Ksh([0-9,.]+)\s+paid\s+to\s+([^.]+)\./i
    );
    if (paybillMatch) {
      results.push({
        reference: paybillMatch[1],
        amount: repo.toMoney(parseFloat(paybillMatch[2].replace(/,/g, ''))),
        description: `Paid to ${paybillMatch[3].trim()}`,
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        category: categorizeKenyanDescription(paybillMatch[3]),
      });
      continue;
    }
  }

  return results;
}

function formatDateKenyan(raw: string): string {
  try {
    const parts = raw.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
  } catch {}
  return new Date().toISOString().split('T')[0];
}

function categorizeKenyanDescription(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('kplc') || d.includes('power') || d.includes('water') || d.includes('tokens'))
    return 'Utilities & Water (KPLC)';
  if (
    d.includes('safaricom') ||
    d.includes('airtime') ||
    d.includes('fibre') ||
    d.includes('bundles') ||
    d.includes('zuku')
  )
    return 'Airtime & Internet (Safaricom)';
  if (
    d.includes('naivas') ||
    d.includes('quickmart') ||
    d.includes('carrefour') ||
    d.includes('groceries') ||
    d.includes('food')
  )
    return 'Food & Groceries';
  if (
    d.includes('total') ||
    d.includes('rubis') ||
    d.includes('shell') ||
    d.includes('matatu') ||
    d.includes('uber') ||
    d.includes('bolt') ||
    d.includes('petrol')
  )
    return 'Transport & Fuel (Matatu/Petrol)';
  if (d.includes('rent') || d.includes('landlord') || d.includes('housing')) return 'Rent & Housing';
  if (d.includes('hospital') || d.includes('pharmacy') || d.includes('chemist') || d.includes('doctor'))
    return 'Healthcare & Pharmacy';
  if (d.includes('school') || d.includes('fees') || d.includes('university') || d.includes('college'))
    return 'Education & School Fees';
  if (d.includes('salary') || d.includes('payroll') || d.includes('wages'))
    return 'Salary & Primary Income';
  if (
    d.includes('mmf') ||
    d.includes('cic') ||
    d.includes('sanlam') ||
    d.includes('shares') ||
    d.includes('cdsc')
  )
    return 'Savings & MMF Deposit';
  if (
    d.includes('fuliza') ||
    d.includes('m-shwari loan') ||
    d.includes('kcb mpesa') ||
    d.includes('loan')
  )
    return 'Loan & Fuliza Repayment';
  return 'Shopping & Essentials';
}
