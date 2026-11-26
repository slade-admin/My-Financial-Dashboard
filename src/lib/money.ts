import { BadRequestError } from './errors';

export function requireKES(currency: string = 'KES'): string {
  if (currency !== 'KES') throw new BadRequestError('Only KES is supported. Currency conversion is not enabled.');
  return currency;
}

export function moneyInput(
  value: unknown,
  label: string,
  { allowZero = false, allowNegative = false } = {},
): number {
  if (typeof value === 'string' && !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) {
    throw new BadRequestError(`${label} must be a decimal amount.`);
  }
  const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) ||
      (!allowNegative && amount < 0) || (!allowZero && amount === 0)) {
    throw new BadRequestError(`${label} must be a finite ${allowNegative ? '' : 'positive '}amount.`);
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.000001) {
    throw new BadRequestError(`${label} must have at most two decimal places and be within the supported range.`);
  }
  return cents / 100;
}

export function accountId(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    throw new BadRequestError('A valid account or record ID is required.');
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestError('A valid account is required.');
  return id;
}

export function ledgerDate(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new BadRequestError('A valid YYYY-MM-DD date is required.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestError('Invalid calendar date.');
  }
  return value;
}
