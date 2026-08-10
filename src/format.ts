import type { Transaction, TransactionKind } from './api';

export const CURRENCY = 'CHF';

const money = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1'234.50" — no currency code; screens place that themselves where it belongs. */
export const formatAmount = (value: number): string => money.format(Math.abs(value));

export const formatSigned = (value: number): string =>
  `${value < 0 ? '−' : ''}${money.format(Math.abs(value))}`;

/** How a transaction moves the balance of the account it sits on. */
export const signOf = (kind: TransactionKind): 1 | -1 =>
  kind === 'INCOME' || kind === 'TRANSFER_IN' ? 1 : -1;

export const isTransfer = (kind: TransactionKind): boolean =>
  kind === 'TRANSFER_IN' || kind === 'TRANSFER_OUT';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "Today" / "Yesterday" / "Mon, 3 Feb" — dates people actually recognise. */
export function formatDayHeading(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const suffix =
    target.getFullYear() === today.getFullYear() ? '' : ` ${target.getFullYear()}`;
  return `${dayNames[target.getDay()]}, ${target.getDate()} ${monthNames[target.getMonth()].slice(0, 3)}${suffix}`;
}

export const formatMonthLabel = (d: Date): string =>
  `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

export const formatTime = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export type DaySection = { key: string; title: string; total: number; data: Transaction[] };

/** Groups transactions into day buckets, newest first, with a per-day net total. */
export function groupByDay(transactions: Transaction[]): DaySection[] {
  const buckets = new Map<string, Transaction[]>();

  for (const tx of transactions) {
    const day = startOfDay(new Date(tx.date)).toISOString();
    const list = buckets.get(day);
    if (list) list.push(tx);
    else buckets.set(day, [tx]);
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, data]) => {
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return {
        key,
        title: formatDayHeading(new Date(key)),
        // Transfers net to zero across accounts, so they are left out of the day total.
        total: data
          .filter((t) => !isTransfer(t.kind))
          .reduce((sum, t) => sum + signOf(t.kind) * t.amount, 0),
        data,
      };
    });
}

export const sameMonth = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
