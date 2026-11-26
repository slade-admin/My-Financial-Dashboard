import { randomUUID } from 'node:crypto';
import { query } from '../db';
import { PersonalSavingsGoal, GoalContribution, todayLocal, toMoney, toDateString, DbRow } from './types';
import { accountId, ledgerDate, moneyInput, requireKES } from '../money';
import { BadRequestError, ConflictError } from '../errors';
import { optionalDate, textInput, uuidInput } from '../validation';
import { auditedTransaction, checkVersion, editRecord, insertRecord } from './history';

type GoalDetails = Pick<PersonalSavingsGoal, 'name' | 'target_amount' | 'currency' | 'target_date'>;

function goalDetails(goal: GoalDetails) {
  return {
    name: textInput(goal.name, 'Goal name', 255),
    target_amount: moneyInput(goal.target_amount, 'Goal target'),
    currency: requireKES(goal.currency),
    target_date: optionalDate(goal.target_date) || null,
  };
}

export async function getSavingsGoals(userId: number): Promise<PersonalSavingsGoal[]> {
  const res = await query(
    'SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY id ASC',
    [userId]
  );
  return res.rows.map(mapGoalRow);
}

export async function addSavingsGoal(
  userId: number,
  goal: Omit<PersonalSavingsGoal, 'id'> & { request_id?: string }
): Promise<PersonalSavingsGoal> {
  const details = goalDetails(goal);
  const saved = moneyInput(goal.current_amount ?? 0, 'Saved amount', { allowZero: true });
  return auditedTransaction('Savings goal created; earmarking only, no money moved', async (client) => {
    const result = await insertRecord(client, userId, 'savings_goals', { ...details, current_amount: saved }, goal.request_id);
    if (result.created && saved) await client.query(
      `INSERT INTO goal_contributions (user_id,goal_id,amount,date,note)
        VALUES ($1,$2,$3,$4,'Initial earmark; no money moved')`,
      [userId, result.row.id, saved, todayLocal()],
    );
    return mapGoalRow(result.row);
  });
}

export async function editSavingsGoal(userId: number, id: string | number, goal: GoalDetails, version: unknown, reason: string) {
  return mapGoalRow(await editRecord(userId, 'savings_goals', id, version, goalDetails(goal), reason));
}

export async function contributeToGoal(userId: number, id: string | number, input: {
  amount: unknown; date: string; note?: string; request_id: string; version: unknown;
}) {
  const goalId = accountId(id);
  const amount = moneyInput(input.amount, 'Earmark change', { allowNegative: true });
  const date = ledgerDate(input.date);
  const note = textInput(input.note, 'Contribution note', 500, true) ||
    (amount > 0 ? 'Earmarked existing savings; no money moved' : 'Released earmark; no money moved');
  const requestId = uuidInput(input.request_id, 'Contribution request ID');
  return auditedTransaction(note, async (client) => {
    const result = await client.query('SELECT * FROM savings_goals WHERE id=$1 AND user_id=$2 FOR UPDATE', [goalId, userId]);
    if (!result.rowCount) throw new BadRequestError('Goal not found for user.');
    requireKES(result.rows[0].currency);
    const previous = await client.query('SELECT * FROM goal_contributions WHERE goal_id=$1 AND user_id=$2 AND request_id=$3',
      [goalId, userId, requestId]);
    if (previous.rowCount) {
      const contribution = previous.rows[0];
      if (toMoney(contribution.amount) !== amount || toDateString(contribution.date) !== date || contribution.note !== note) {
        throw new ConflictError('This contribution request was already used with different details.');
      }
      return { goal: mapGoalRow(result.rows[0]), contribution: mapContribution(contribution), isDuplicate: true };
    }
    checkVersion(result.rows[0], input.version);
    const current = moneyInput(toMoney(toMoney(result.rows[0].current_amount) + amount), 'Saved amount', { allowZero: true });
    const added = await client.query(
      `INSERT INTO goal_contributions (user_id,goal_id,amount,date,note,request_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [userId, goalId, amount, date, note, requestId],
    );
    const updated = await client.query('UPDATE savings_goals SET current_amount=$1 WHERE id=$2 AND user_id=$3 RETURNING *',
      [current, goalId, userId]);
    return { goal: mapGoalRow(updated.rows[0]), contribution: mapContribution(added.rows[0]), isDuplicate: false };
  });
}

export async function getGoalContributions(userId: number, id: string | number, page = 0) {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(page * 20)) throw new BadRequestError('Invalid contribution page.');
  const owned = await query('SELECT 1 FROM savings_goals WHERE id=$1 AND user_id=$2', [accountId(id), userId]);
  if (!owned.rowCount) throw new BadRequestError('Goal not found for user.');
  const result = await query(
    `SELECT * FROM goal_contributions WHERE user_id=$1 AND goal_id=$2
      ORDER BY date DESC,id DESC LIMIT 21 OFFSET $3`, [userId, id, page * 20],
  );
  return { contributions: result.rows.slice(0, 20).map(mapContribution), hasMore: result.rows.length > 20 };
}

export async function updateSavingsGoal(
  userId: number,
  id: string | number,
  amountToAdd: number
): Promise<PersonalSavingsGoal | null> {
  const result = await query('SELECT version FROM savings_goals WHERE id=$1 AND user_id=$2', [accountId(id), userId]);
  if (!result.rowCount) return null;
  return (await contributeToGoal(userId, id, {
    amount: moneyInput(amountToAdd, 'Contribution'), date: todayLocal(), request_id: randomUUID(), version: result.rows[0].version,
  })).goal;
}

function mapContribution(row: DbRow): GoalContribution {
  return { id: row.id, amount: toMoney(row.amount), date: toDateString(row.date)!,
    note: row.note, created_at: new Date(row.created_at).toISOString() };
}

function mapGoalRow(r: DbRow): PersonalSavingsGoal {
  const targetDateStr = toDateString(r.target_date);

  return {
    id: r.id,
    version: r.version,
    name: r.name,
    target_amount: toMoney(r.target_amount),
    current_amount: toMoney(r.current_amount),
    currency: r.currency || 'KES',
    target_date: targetDateStr || undefined,
  };
}
