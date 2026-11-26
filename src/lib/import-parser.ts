import { parse, CsvError } from 'csv-parse/sync';
import { BadRequestError } from './errors';
import { ledgerDate, moneyInput } from './money';
import { classifyMpesaDetails, mpesaDateToIso } from './mpesa';
import { parseSms } from './sms';
import type { ImportFormat, ParsedImportRow, ImportMovement } from './import-types';

function statementMoney(raw: string, label: string): number {
  let value = raw.trim().replace(/^(?:KES|Kshs?)\.?\s*/i, '').trim();
  if (!value || value === '-') return 0;
  if (/^\(.*\)$/.test(value)) value = `-${value.slice(1, -1)}`;
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(value)) {
    throw new BadRequestError(`${label} is not a valid monetary amount.`);
  }
  return moneyInput(value.replace(/,/g, ''), label, { allowZero: true, allowNegative: true });
}

function parseCsv(raw: string): ParsedImportRow[] {
  let records: Array<{ record: string[]; raw: string; info: { lines: number } }>;
  try {
    records = parse(raw, {
      bom: true, skip_empty_lines: true, trim: true, relax_column_count: true, raw: true, info: true,
    }) as unknown as typeof records;
  } catch (error) {
    if (error instanceof CsvError) {
      throw new BadRequestError(`CSV syntax error near line ${error.lines ?? '?'}: check quoted fields and delimiters. Nothing was imported.`);
    }
    throw error;
  }
  if (!records.length) throw new BadRequestError('The CSV has no records.');
  const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const header = records[0].record.map(key);
  const aliases = {
    reference: ['receiptno', 'receiptnumber', 'receipt'],
    date: ['completiontime', 'date', 'transactiondate'],
    description: ['details', 'description'],
    status: ['transactionstatus', 'status'],
    paidIn: ['paidin'], withdrawn: ['withdrawn', 'paidout'],
    balance: ['balance'], fee: ['transactioncost', 'transactionfee', 'fee'],
  };
  const hasHeader = header.some((h) => aliases.reference.includes(h));
  const positions = Object.fromEntries(Object.entries(aliases).map(([field, names]) =>
    [field, hasHeader ? header.findIndex((h) => names.includes(h)) : ['reference', 'date', 'description', 'status', 'paidIn', 'withdrawn', 'balance'].indexOf(field)],
  ));
  if (hasHeader && ['reference', 'date', 'description', 'status', 'paidIn', 'withdrawn'].some((field) => positions[field] < 0)) {
    throw new BadRequestError('Use the M-Pesa CSV columns: Receipt No., Completion Time, Details, Transaction Status, Paid In and Withdrawn.');
  }
  return records.slice(hasHeader ? 1 : 0).map((entry, index) => {
    const row: ParsedImportRow = { row: index + 1, line: entry.info.lines, raw: entry.raw.trim(), warnings: [] };
    const read = (field: string) => entry.record[positions[field]]?.trim() ?? '';
    try {
      if (entry.record.length !== records[0].record.length || (!hasHeader && entry.record.length !== 7)) {
        throw new BadRequestError('Wrong number of CSV fields.');
      }
      if (!/^(completed|successful|success)$/i.test(read('status'))) {
        throw new BadRequestError(`Transaction status "${read('status') || 'missing'}" is not successful.`);
      }
      const reference = read('reference').toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(reference)) throw new BadRequestError('Invalid M-Pesa receipt number.');
      const paidIn = statementMoney(read('paidIn'), 'Paid in');
      const withdrawn = statementMoney(read('withdrawn'), 'Withdrawn');
      if (paidIn < 0 || (paidIn > 0 && withdrawn !== 0) || (paidIn === 0 && withdrawn === 0)) {
        throw new BadRequestError('Exactly one positive paid-in or non-zero withdrawn amount is required.');
      }
      const type = paidIn > 0 ? 'income' : 'expense';
      const amount = Math.abs(paidIn || withdrawn);
      const dateRaw = read('date');
      const date = /^\d{4}-\d{2}-\d{2}(?:\s|T|$)/.test(dateRaw)
        ? dateRaw.slice(0, 10) : dateRaw ? mpesaDateToIso(dateRaw.split(/\s/)[0]) : '';
      ledgerDate(date);
      const description = read('description');
      if (!description || description.length > 500) throw new BadRequestError('Description must have 1 to 500 characters.');
      if (read('balance')) statementMoney(read('balance'), 'Balance');
      const cost = statementMoney(read('fee'), 'Fee');
      if (cost < 0) throw new BadRequestError('Fee cannot be negative.');
      const classification = classifyMpesaDetails(description, type);
      row.movement = {
        source: 'mpesa', reference, date, amount, type, description, cost,
        ...classification, syntheticReference: false, dateInferred: false, ambiguousIdentity: false,
      };
      if (!hasHeader) row.warnings.push('No header: assumed the standard seven-column M-Pesa layout.');
      if (type === 'expense' && positions.fee < 0) {
        row.warnings.push('No fee column: verify whether the amount includes fees or fees have separate rows. Add only fees charged on top of this principal.');
      }
      if (type === 'income' && /\b(?:bank|equity|kcb|co-?operative|absa|ncba|stanbic|dtb)\b/i.test(description)) {
        row.warnings.push('This may be money moved from your own bank. Verify income versus a paired transfer.');
      }
      if (cost) row.warnings.push('Verify the principal and fee: the fee is charged on top of the principal shown below.');
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      row.error = error.message;
    }
    return row;
  });
}

function smsRecords(raw: string): Array<{ line: number; raw: string }> {
  const records: Array<{ line: number; raw: string }> = [];
  let current: { line: number; raw: string } | undefined;
  const flush = () => { if (current) records.push(current); current = undefined; };
  const starts = /^(?:[A-Z0-9]{10}\s+Confirmed|Equity\b|KCB\b|Co-?op\b|Absa\b|NCBA\b|Stanbic\b|DTB\b|Family Bank\b|I&M\b|Standard Chartered\b|Your\s+(?:a\/c|acc(?:ount)?)\b)/i;
  const continuation = /^(?:new\s+M-?PESA\s+balance|transaction\s+cost|available\s+balance|balance\b|bal\b|on\s+\d|at\s+\d|ref(?:erence)?\b|Ksh|KES|\d{1,2}[/-]\d)/i;
  for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (!current) current = { line: index + 1, raw: line };
    else if (starts.test(line) || parseSms(line)) { flush(); current = { line: index + 1, raw: line }; }
    else if (continuation.test(line) || (!parseSms(current.raw) && starts.test(current.raw))) current.raw += ` ${line}`;
    else { flush(); current = { line: index + 1, raw: line }; }
  }
  flush();
  return records;
}

export function parseImportSource(raw: string, requested: ImportFormat = 'auto'): {
  format: 'sms' | 'mpesa_csv'; rows: ParsedImportRow[];
} {
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestError('Provide CSV or SMS text.');
  if (Buffer.byteLength(raw, 'utf8') > 5 * 1024 * 1024) throw new BadRequestError('Import at most 5 MB at a time; split larger histories into batches.');
  if (!['auto', 'sms', 'mpesa_csv'].includes(requested)) throw new BadRequestError('Unsupported import format.');
  const first = raw.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/)[0];
  const format = requested === 'auto' ? (/^(?:"?Receipt\b|"?[A-Z0-9]{10}"?,)/i.test(first) ? 'mpesa_csv' : 'sms') : requested;
  const rows = format === 'mpesa_csv' ? parseCsv(raw) : smsRecords(raw).map((record, index): ParsedImportRow => {
    const row: ParsedImportRow = { row: index + 1, ...record, warnings: [] };
    const parsed = parseSms(record.raw);
    if (!parsed) return { ...row, error: 'Unsupported, unsuccessful or malformed SMS. No transaction will be created.' };
    const movement: ImportMovement = {
      ...parsed, date: parsed.dateInferred ? '' : parsed.date,
      sourceFingerprint: parsed.sourceFingerprint,
    };
    row.movement = movement;
    if (parsed.dateInferred) row.warnings.push('No transaction date in the SMS. Enter the actual date; today is not assumed.');
    if (parsed.ambiguousIdentity) row.warnings.push('No issuer reference. Identical alerts may be retries or distinct payments, even when a time is shown; verify before importing.');
    if (parsed.ambiguousAmount) row.warnings.push('Several transaction amounts were found. Verify the principal and fee against the SMS.');
    if (parsed.classificationNeedsReview) {
      row.warnings.push('Verify the type, principal and fee: a generic bank alert, own-money transfer, refund or loan is not necessarily income or spending.');
    }
    if (parsed.source === 'mpesa' && parsed.type === 'expense' && parsed.cost === undefined) {
      row.warnings.push('The SMS does not state a fee. Verify whether zero is correct.');
    }
    return row;
  });
  if (!rows.length) throw new BadRequestError('No data rows were found.');
  if (rows.length > 10000) throw new BadRequestError('Import at most 10,000 rows per batch; split larger histories.');
  return { format, rows };
}
