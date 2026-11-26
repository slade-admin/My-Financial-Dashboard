import { BadRequestError } from './errors';
import { canonicalCategory } from './categories';
import { ledgerDate } from './money';
import { todayLocal } from './repo/types';

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestError('A JSON object is required.');
  return value as Record<string, unknown>;
}

export function textInput(value: unknown, label: string, maxLength: number, optional = false): string {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > maxLength) {
    throw new BadRequestError(`${label} must be ${optional ? '' : 'non-empty '}text of at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function categoryInput(value: unknown): string {
  return canonicalCategory(textInput(value, 'Category', 100));
}

export function choiceInput<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new BadRequestError(`Invalid ${label}.`);
  return value as T;
}

export function optionalDate(value: unknown): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : ledgerDate(value as string);
}

export function versionInput(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new BadRequestError('The record version is required. Refresh the record and retry.');
  }
  return value;
}

export function uuidInput(value: unknown, label = 'Request ID'): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
    throw new BadRequestError(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function queryInteger(value: string | null, fallback: number, label: string): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestError(`${label} must be a non-negative integer.`);
  }
  return Number(value);
}

export function emailInput(value: unknown): string {
  const email = textInput(value, 'Email', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestError('Invalid email address.');
  return email;
}

export function passwordInput(value: unknown, creating = false): string {
  if (typeof value !== 'string' || value.length < (creating ? 8 : 1) || value.length > 1024) {
    throw new BadRequestError(`Password must contain ${creating ? '8' : '1'} to 1024 characters.`);
  }
  return value;
}

export function countryInput(value: unknown): string {
  const country = textInput(value, 'Country code', 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new BadRequestError('Country must be a two-letter code.');
  return country;
}

export function birthDateInput(value: unknown): string | undefined {
  const date = optionalDate(value);
  if (date && date > todayLocal()) throw new BadRequestError('Date of birth cannot be in the future.');
  return date;
}

export function timestampInput(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(new Date(value).getTime())) {
    throw new BadRequestError('receivedAt must be an ISO timestamp with a timezone.');
  }
  ledgerDate(value.slice(0, 10));
  return value;
}
