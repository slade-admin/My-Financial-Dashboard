import type { PersonalTransaction } from './repo/types';

export type ImportFormat = 'auto' | 'sms' | 'mpesa_csv';
export type ImportTransaction = Omit<PersonalTransaction, 'id'>;
export type ImportReviewTransaction = Omit<ImportTransaction, 'amount' | 'fee_amount'> & {
  amount: number | string;
  fee_amount?: number | string;
};

export interface ImportMovement {
  source: 'mpesa' | 'bank';
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  date: string;
  description: string;
  category: string;
  reference: string;
  kind: string;
  cost?: number;
  institution?: string;
  accountIdentifier?: string;
  syntheticReference: boolean;
  dateInferred: boolean;
  ambiguousIdentity: boolean;
  sourceFingerprint?: string;
}

export interface ParsedImportRow {
  row: number;
  line: number;
  raw: string;
  movement?: ImportMovement;
  error?: string;
  warnings: string[];
}

export interface ImportPreviewRow extends ParsedImportRow {
  transaction?: ImportTransaction;
  status: 'ready' | 'duplicate' | 'review' | 'rejected' | 'conflict';
  issues: string[];
  needsReview: boolean;
  reviewed?: boolean;
  duplicateId?: string | number;
  outcome?: 'imported' | 'duplicate' | 'rejected' | 'skipped';
  transactionId?: string | number;
}

export interface ImportChoice {
  row: number;
  decision: 'import' | 'duplicate' | 'skip';
  reviewed: boolean;
  transaction?: ImportReviewTransaction;
}

export interface ImportSummary {
  total: number;
  ready: number;
  review: number;
  conflicts: number;
  imported: number;
  duplicates: number;
  rejected: number;
  skipped: number;
}

export interface ImportBalanceChange {
  accountId: number;
  accountName: string;
  change: number;
  before: number;
  after: number;
}

export interface ImportBatch {
  id: string;
  sourceName: string;
  format: Exclude<ImportFormat, 'auto'>;
  status: 'preview' | 'committed' | 'reversed';
  summary: ImportSummary;
  createdAt: string;
  committedAt?: string;
  reversedAt?: string;
  seenCount: number;
  rows: ImportPreviewRow[];
  reversal?: { transactions: number; balances: ImportBalanceChange[] };
}

export type ImportBatchListItem = Omit<ImportBatch, 'rows'>;
