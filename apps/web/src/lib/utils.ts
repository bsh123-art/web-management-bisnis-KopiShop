import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Kopi POS';
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? 'IDR';
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? 'id-ID';

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: CURRENCY === 'IDR' ? 0 : 2,
  maximumFractionDigits: CURRENCY === 'IDR' ? 0 : 2,
});

const compactFormatter = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

export const formatCurrency = (value: number | string | null | undefined) =>
  currencyFormatter.format(Number(value ?? 0));

export const formatCompact = (value: number | null | undefined) => compactFormatter.format(Number(value ?? 0));

export const formatNumber = (value: number | string | null | undefined) => numberFormatter.format(Number(value ?? 0));

export const formatPercent = (value: number | null | undefined, digits = 1) =>
  `${Number(value ?? 0).toFixed(digits)}%`;

export const formatDate = (value: string | Date | null | undefined, withTime = false) => {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
};

export const formatTime = (value: string | Date) =>
  new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

/** "3 minutes ago" style labels for activity feeds. */
export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ];

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  let value_ = diffSeconds;
  for (const [unit, size] of units) {
    if (Math.abs(value_) < size) return rtf.format(Math.round(value_), unit);
    value_ /= size;
  }
  return rtf.format(Math.round(value_), 'year');
}

export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
