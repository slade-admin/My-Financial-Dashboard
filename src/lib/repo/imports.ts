import { createHash, randomUUID } from 'node:crypto';
import { getPool, query } from '../db';
import { BadRequestError, ConflictError } from '../errors';
import { bankAccountMatches } from '../account-identifiers';
import { parseImportSource } from '../import-parser';
import { importTransaction } from '../import-ledger';
import { ledgerEffects } from '../ledger';
import { accountId, moneyInput, requireKES } from '../money';
import { choiceInput } from '../validation';
import { getAccounts } from './accounts';
import { addTransactionInTransaction, normalizeTransaction, transactionsMatch } from './transactions';
import { toMoney, type DbRow } from './types';
import type {
  ImportBatch, ImportBatchListItem, ImportChoice, ImportFormat, ImportPreviewRow,
  ImportSummary, ImportTransaction, ImportBalanceChange,
} from '../import-types';

function batchId(id: string): string {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    throw new BadRequestError('A valid import batch ID is required.');
  }
  return id;
}

function summary(rows: ImportPreviewRow[]): ImportSummary {
  const count = (status: ImportPreviewRow['status']) => rows.filter((r) => r.status === status).length;
  return { total: rows.length, ready: count('ready'), review: count('review'), conflicts: count('conflict'),
    imported: 0, duplicates: count('duplicate'), rejected: count('rejected'), skipped: 0 };
}

function mapBatch(row: DbRow): ImportBatch {
  return {
    id: row.id, sourceName: row.source_name, format: row.format, status: row.status,
    summary: row.summary, rows: row.rows || [], seenCount: row.seen_count,
    createdAt: new Date(row.created_at).toISOString(),
    committedAt: row.committed_at ? new Date(row.committed_at).toISOString() : undefined,
    reversedAt: row.reversed_at ? new Date(row.reversed_at).toISOString() : undefined,
    reversal: row.reversal ?? undefined,
  };
}

export async function getImportBatch(userId: number, id: string): Promise<ImportBatch> {
  const result = await query('SELECT * FROM import_batches WHERE id=$1 AND user_id=$2', [batchId(id), userId]);
  if (!result.rowCount) throw new BadRequestError('Import batch not found for user.');
  return mapBatch(result.rows[0]);
}

export async function getImportBatches(userId: number, page = 0): Promise<{ batches: ImportBatchListItem[]; hasMore: boolean }> {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(page * 20)) throw new BadRequestError('Invalid history page.');
  const result = await query(`SELECT id,source_name,format,status,summary,seen_count,created_at,committed_at,reversed_at,reversal
    FROM import_batches WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $2`, [userId, page * 20]);
  return {
    batches: result.rows.slice(0, 20).map((row) => {
      const { rows: _rows, ...item } = mapBatch(row);
      void _rows;
      return item;
    }),
    hasMore: result.rows.length > 20,
  };
}

export async function createImportPreview(userId: number, options: {
  rawText: string; format?: ImportFormat; accountId?: string | number; counterpartAccountId?: string | number;
  sourceName?: string; allowUnmapped?: boolean; ingestKey?: string; reviewReason?: string;
}): Promise<ImportBatch> {
  const format = choiceInput(options.format === undefined ? 'auto' : options.format, ['auto', 'sms', 'mpesa_csv'], 'import format');
  if (options.accountId !== undefined && options.accountId !== '') accountId(options.accountId);
  if (options.counterpartAccountId !== undefined && options.counterpartAccountId !== '') accountId(options.counterpartAccountId);
  const accounts = await getAccounts(userId);
  const defaultAccount = accounts.find((a) => String(a.id) === String(options.accountId));
  if (!options.allowUnmapped && !defaultAccount) throw new BadRequestError('Choose an owned account before creating a preview.');
  if (options.accountId && !defaultAccount) throw new BadRequestError('Account not found for user.');
  if (options.counterpartAccountId && !accounts.some((a) => String(a.id) === String(options.counterpartAccountId))) {
    throw new BadRequestError('Counterpart account not found for user.');
  }
  const parsed = parseImportSource(options.rawText, format);
  const references = parsed.rows.flatMap((r) => r.movement ? [r.movement.reference] : []);
  const existing = await query('SELECT * FROM transactions WHERE user_id=$1 AND reference=ANY($2::text[]) AND voided_at IS NULL', [userId, references]);
  const seen = new Map<string, DbRow>(existing.rows.map((r) => [r.reference, r]));
  const rows: ImportPreviewRow[] = parsed.rows.map((row) => {
    const result: ImportPreviewRow = { ...row, warnings: [...row.warnings], status: 'rejected', issues: [], needsReview: false };
    if (options.reviewReason) result.warnings.push(options.reviewReason);
    const movement = row.movement;
    if (!movement || row.error) { result.issues.push(row.error || 'Unsupported source row.'); return result; }
    if (movement.kind === 'fuliza') {
      result.error = 'Loan principal needs manual loan tracking; it cannot be imported as spending.';
      result.issues.push(result.error);
      return result;
    }
    let primary = defaultAccount;
    if (movement.source === 'bank') {
      const matches = accounts.filter((a) => bankAccountMatches(a, movement.accountIdentifier, movement.institution));
      if (matches.length === 1) primary = matches[0];
      else result.warnings.push('Bank account identifier is missing, unmatched or ambiguous. Explicitly verify the account assignment.');
    }
    const source = parsed.format === 'mpesa_csv' ? 'mpesa_statement' : movement.source === 'bank' ? 'bank_sms' : 'mpesa_sms';
    try {
      if (!primary) throw new BadRequestError('Choose the account this message belongs to.');
      result.transaction = importTransaction(accounts, primary, movement, source, options.counterpartAccountId);
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      const transfer = ['withdraw', 'deposit', 'mshwari'].includes(movement.kind) || movement.type === 'transfer';
      const incoming = movement.kind === 'deposit' || (movement.kind === 'mshwari' && movement.type === 'income');
      result.transaction = {
        account_id: incoming ? options.counterpartAccountId || '' : primary?.id || '',
        transfer_account_id: transfer ? (incoming ? primary?.id || '' : options.counterpartAccountId || '') : undefined,
        amount: movement.amount, currency: 'KES', type: transfer ? 'transfer' : movement.type,
        date: movement.date, description: movement.description, category: movement.category,
        reference: movement.reference, import_source: source,
        fee_amount: movement.cost || 0, fee_account_id: movement.cost ? primary?.id : undefined,
        source_fingerprint: movement.sourceFingerprint,
      };
      result.issues.push(error.message);
    }
    result.needsReview = result.warnings.length > 0 || result.issues.length > 0;
    try {
      const tx = normalizeTransaction(result.transaction);
      const known = seen.get(tx.reference!);
      if (known) {
        result.duplicateId = known.id;
        if (!transactionsMatch(known, tx) ||
            (movement.source === 'bank' && tx.source_fingerprint !== known.source_fingerprint)) {
          result.status = 'conflict';
          result.issues.push('The reference is already used with different transaction details. Correct the row or explicitly use a new reference for a distinct event.');
          result.needsReview = true;
        } else result.status = result.needsReview ? 'review' : 'duplicate';
      } else {
        result.status = result.needsReview ? 'review' : 'ready';
        seen.set(tx.reference!, tx);
      }
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      if (!result.issues.includes(error.message)) result.issues.push(error.message);
      result.status = 'review';
      result.needsReview = true;
    }
    return result;
  });
  if (options.sourceName !== undefined && typeof options.sourceName !== 'string') throw new BadRequestError('Source name must be text.');
  const sourceName = options.sourceName?.trim() || 'Pasted text';
  if (sourceName.length > 255) throw new BadRequestError('Source name is too long.');
  const result = await query(`
    INSERT INTO import_batches (id,user_id,format,source_name,rows,summary,ingest_key)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
    ON CONFLICT (user_id,ingest_key) WHERE status='preview' AND ingest_key IS NOT NULL
      DO UPDATE SET seen_count=import_batches.seen_count+1
    RETURNING *
  `, [randomUUID(), userId, parsed.format, sourceName, JSON.stringify(rows), JSON.stringify(summary(rows)), options.ingestKey ?? null]);
  return mapBatch(result.rows[0]);
}

function reviewedTransaction(row: ImportPreviewRow, choice: ImportChoice): ImportTransaction {
  const values = choice.transaction === undefined ? row.transaction : choice.transaction;
  if (!row.movement || row.error || !values || typeof values !== 'object' || Array.isArray(values)) {
    throw new BadRequestError(`Row ${row.row} is rejected. Correct the source text or skip it.`);
  }
  const tx = normalizeTransaction({
    account_id: values.account_id, amount: moneyInput(values.amount, 'Amount'), currency: 'KES', type: values.type,
    transfer_account_id: values.transfer_account_id === '' ? undefined : values.transfer_account_id,
    fee_amount: moneyInput(values.fee_amount ?? 0, 'Fee', { allowZero: true }),
    fee_account_id: values.fee_account_id, date: values.date, description: values.description,
    category: values.category, reference: values.reference,
    import_source: row.transaction!.import_source, source_fingerprint: row.movement.sourceFingerprint,
  });
  if (!tx.reference || tx.description.length > 500 || tx.category.length > 100) {
    throw new BadRequestError(`Row ${row.row}: reference is required; description/category are limited to 500/100 characters.`);
  }
  if (row.movement.source === 'mpesa') {
    tx.reference = tx.reference.toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(tx.reference)) throw new BadRequestError(`Row ${row.row}: enter the actual ten-character M-Pesa receipt.`);
  }
  return tx;
}

export async function commitImportBatch(userId: number, id: string, choices: ImportChoice[]): Promise<ImportBatch> {
  if (!Array.isArray(choices)) throw new BadRequestError('Reviewed row decisions are required.');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM import_batches WHERE id=$1 AND user_id=$2 FOR UPDATE', [batchId(id), userId]);
    if (!locked.rowCount) throw new BadRequestError('Import batch not found for user.');
    const batch = mapBatch(locked.rows[0]);
    if (batch.status === 'reversed') throw new ConflictError('This batch was reversed. Create a new preview to import again.');
    const byRow = new Map<number, ImportChoice>();
    const rowNumbers = new Set(batch.rows.map((r) => r.row));
    for (const choice of choices) {
      if (!choice || !Number.isInteger(choice.row) || !rowNumbers.has(choice.row) || byRow.has(choice.row) ||
          !['import', 'duplicate', 'skip'].includes(choice.decision) ||
          (choice.reviewed !== undefined && typeof choice.reviewed !== 'boolean')) throw new BadRequestError('Invalid or repeated row decision.');
      byRow.set(choice.row, choice);
    }
    const reviewed = batch.rows.map((row) => {
      const choice = byRow.get(row.row) || { row: row.row, decision: 'skip' as const, reviewed: false };
      const tx = choice.decision === 'skip' ? undefined : reviewedTransaction(row, choice);
      if (choice.decision !== 'skip' && row.needsReview && choice.reviewed !== true) {
        throw new BadRequestError(`Review the warnings and account/date assignment for row ${row.row}.`);
      }
      return { row, choice, tx };
    });
    const hash = createHash('sha256').update(JSON.stringify(reviewed.map(({ row, choice, tx }) =>
      ({ row: row.row, decision: choice.decision, reviewed: choice.reviewed === true, transaction: tx })))).digest('hex');
    if (batch.status === 'committed') {
      if (locked.rows[0].commit_hash !== hash) throw new ConflictError('This batch was already confirmed with different decisions.');
      await client.query('COMMIT');
      return batch;
    }
    const ids = [...new Set(reviewed.flatMap(({ tx }) => tx ? [Number(tx.account_id), ...(tx.transfer_account_id ? [Number(tx.transfer_account_id)] : [])] : []))].sort((a, b) => a - b);
    const owned = await client.query('SELECT id,name,currency FROM accounts WHERE user_id=$1 AND id=ANY($2::int[]) AND is_active ORDER BY id FOR UPDATE', [userId, ids]);
    if (owned.rowCount !== ids.length) throw new BadRequestError('An assigned account is unavailable or not owned by you.');
    owned.rows.forEach((a) => requireKES(a.currency));
    const counts: ImportSummary = { ...summary(batch.rows), imported: 0, duplicates: 0, rejected: 0, skipped: 0 };
    for (const { row, choice } of reviewed) row.reviewed = choice.reviewed === true;
    const effects = new Map<number, number>();
    // Consistent reference order also avoids index-lock cycles between disjoint-wallet batches.
    const ordered = [...reviewed].sort((a, b) => (a.tx?.reference || '').localeCompare(b.tx?.reference || ''));
    for (const item of ordered.filter((r) => r.choice.decision === 'import')) {
      const result = await addTransactionInTransaction(client, userId, item.tx!, { batchId: id, lockedAccounts: owned.rows, deferBalances: true });
      item.row.transaction = item.tx;
      item.row.transactionId = result.transaction.id;
      item.row.outcome = result.isDuplicate ? 'duplicate' : 'imported';
      counts[result.isDuplicate ? 'duplicates' : 'imported']++;
      if (!result.isDuplicate) {
        for (const [account, delta] of ledgerEffects(item.tx!, true)) {
          effects.set(account, (effects.get(account) ?? 0) + Math.round(delta * 100));
        }
      }
    }
    for (const { row, choice, tx } of reviewed.filter((r) => r.choice.decision !== 'import')) {
      if (choice.decision === 'duplicate') {
        const existing = (await client.query('SELECT * FROM transactions WHERE user_id=$1 AND reference=$2 AND voided_at IS NULL', [userId, tx!.reference])).rows[0];
        if (existing && (!transactionsMatch(existing, tx!) ||
            (tx!.import_source === 'bank_sms' && existing.source_fingerprint !== tx!.source_fingerprint && !choice.reviewed))) {
          throw new ConflictError(`Row ${row.row} no longer matches the recorded transaction. Refresh the preview.`);
        }
        row.outcome = existing ? 'duplicate' : 'skipped';
        row.transactionId = existing?.id;
        row.transaction = tx;
      } else row.outcome = row.error || !row.movement ? 'rejected' : 'skipped';
      counts[row.outcome === 'duplicate' ? 'duplicates' : row.outcome === 'rejected' ? 'rejected' : 'skipped']++;
    }
    for (const [account, cents] of effects) {
      await client.query('UPDATE accounts SET current_balance=current_balance+$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND user_id=$3',
        [cents / 100, account, userId]);
    }
    const result = await client.query(`UPDATE import_batches SET status='committed',rows=$1::jsonb,summary=$2::jsonb,
      commit_hash=$3,committed_at=CURRENT_TIMESTAMP WHERE id=$4 AND user_id=$5 RETURNING *`,
    [JSON.stringify(batch.rows), JSON.stringify(counts), hash, id, userId]);
    await client.query('COMMIT');
    return mapBatch(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function getImportReversalPreview(userId: number, id: string): Promise<ImportBalanceChange[]> {
  const batch = await getImportBatch(userId, id);
  if (batch.status !== 'committed') throw new BadRequestError('Only a confirmed import can be reversed.');
  const transactions = await query('SELECT * FROM transactions WHERE user_id=$1 AND import_batch_id=$2 AND voided_at IS NULL', [userId, id]);
  const accounts = await query('SELECT id,name,current_balance FROM accounts WHERE user_id=$1', [userId]);
  return reversalBalances(transactions.rows, accounts.rows);
}

function reversalBalances(transactions: DbRow[], accounts: DbRow[]): ImportBalanceChange[] {
  const effects = new Map<number, number>();
  for (const tx of transactions) {
    for (const [id, delta] of ledgerEffects({ ...tx, amount: toMoney(tx.amount) } as ImportTransaction)) {
      effects.set(id, (effects.get(id) ?? 0) - Math.round(delta * 100));
    }
  }
  return [...effects].map(([accountId, cents]) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new BadRequestError('An import account is unavailable.');
    const before = toMoney(account.current_balance);
    return { accountId, accountName: account.name, change: cents / 100, before, after: toMoney(before + cents / 100) };
  });
}

export async function reverseImportBatch(userId: number, id: string): Promise<ImportBatch> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM import_batches WHERE id=$1 AND user_id=$2 FOR UPDATE', [batchId(id), userId]);
    if (!result.rowCount) throw new BadRequestError('Import batch not found for user.');
    const batch = mapBatch(result.rows[0]);
    if (batch.status === 'reversed') { await client.query('COMMIT'); return batch; }
    if (batch.status !== 'committed') throw new BadRequestError('Only a confirmed import can be reversed.');
    const rows = await client.query('SELECT * FROM transactions WHERE user_id=$1 AND import_batch_id=$2 AND voided_at IS NULL', [userId, id]);
    const ids = [...new Set(rows.rows.flatMap((r) => [r.account_id, ...(r.transfer_account_id ? [r.transfer_account_id] : [])]))].sort((a, b) => a - b);
    const accounts = await client.query('SELECT id,name,current_balance FROM accounts WHERE user_id=$1 AND id=ANY($2::int[]) ORDER BY id FOR UPDATE', [userId, ids]);
    const balances = reversalBalances(rows.rows, accounts.rows);
    for (const balance of balances) {
      await client.query('UPDATE accounts SET current_balance=current_balance+$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND user_id=$3',
        [balance.change, balance.accountId, userId]);
    }
    await client.query('UPDATE transactions SET voided_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND import_batch_id=$2 AND voided_at IS NULL', [userId, id]);
    const updated = await client.query(`UPDATE import_batches SET status='reversed',reversed_at=CURRENT_TIMESTAMP,reversal=$1::jsonb
      WHERE id=$2 AND user_id=$3 RETURNING *`, [JSON.stringify({ transactions: rows.rowCount, balances }), id, userId]);
    await client.query('COMMIT');
    return mapBatch(updated.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function discardImportPreview(userId: number, id: string): Promise<void> {
  const result = await query("DELETE FROM import_batches WHERE id=$1 AND user_id=$2 AND status='preview'", [batchId(id), userId]);
  if (!result.rowCount) throw new BadRequestError('Only your pending previews can be discarded.');
}
