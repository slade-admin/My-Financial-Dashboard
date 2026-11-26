import { query } from '../db';
import { PersonalLiability, toMoney, toDateString, DbRow} from './types';
import { moneyInput, requireKES } from '../money';
import { BadRequestError } from '../errors';
import { choiceInput, optionalDate, textInput } from '../validation';
import { auditedTransaction, editRecord, insertRecord } from './history';

type LiabilityDetails = Omit<PersonalLiability, 'id'>;

function liabilityDetails(liability: LiabilityDetails) {
  const interest = liability.interest_rate === undefined || liability.interest_rate === null
    ? null : moneyInput(liability.interest_rate, 'Interest rate', { allowZero: true });
  if (interest !== null && interest > 9999.99) throw new BadRequestError('Interest rate must be at most 9999.99%.');
  return {
    name: textInput(liability.name, 'Liability name', 255),
    creditor: textInput(liability.creditor, 'Creditor', 255, true),
    category: choiceInput(liability.category,
      ['personal_loan', 'mortgage', 'car_loan', 'helb', 'sacco_loan', 'mobile_loan', 'credit_card', 'other'], 'liability category'),
    principal_amount: moneyInput(liability.principal_amount, 'Principal', { allowZero: true }),
    outstanding_balance: moneyInput(liability.outstanding_balance, 'Outstanding balance', { allowZero: true }),
    interest_rate: interest,
    monthly_payment: liability.monthly_payment === undefined || liability.monthly_payment === null
      ? null : moneyInput(liability.monthly_payment, 'Monthly payment', { allowZero: true }),
    currency: requireKES(liability.currency),
    due_date: optionalDate(liability.due_date) || null,
    notes: textInput(liability.notes, 'Notes', 5000, true) || null,
  };
}

export async function getLiabilities(userId: number): Promise<PersonalLiability[]> {
  const res = await query(
    'SELECT * FROM liabilities WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapLiabilityRow);
}

export async function addLiability(
  userId: number,
  liability: Omit<PersonalLiability, 'id'> & { request_id?: string }
): Promise<PersonalLiability> {
  const details = liabilityDetails(liability);
  return auditedTransaction('Liability created', async (client) =>
    mapLiabilityRow((await insertRecord(client, userId, 'liabilities', details, liability.request_id)).row));
}

export async function updateLiability(userId: number, id: string | number, liability: LiabilityDetails, version: unknown, reason: string) {
  return mapLiabilityRow(await editRecord(userId, 'liabilities', id, version, liabilityDetails(liability), reason));
}

function mapLiabilityRow(r: DbRow): PersonalLiability {
  const dueDateStr = toDateString(r.due_date);

  return {
    id: r.id,
    version: r.version,
    name: r.name,
    creditor: r.creditor || '',
    category: r.category,
    principal_amount: toMoney(r.principal_amount),
    outstanding_balance: toMoney(r.outstanding_balance),
    interest_rate: r.interest_rate !== null ? toMoney(r.interest_rate) : undefined,
    monthly_payment: r.monthly_payment !== null ? toMoney(r.monthly_payment) : undefined,
    currency: r.currency || 'KES',
    due_date: dueDateStr || undefined,
    notes: r.notes || undefined,
  };
}
