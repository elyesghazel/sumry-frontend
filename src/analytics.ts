import type { Account, Transaction } from './api';
import { baseOf, isTransfer, signOf, startOfDay } from './format';

export type Range = { from: Date; to: Date; label: string; days: number };

/** Resolves a timeframe key to a concrete window ending now. */
export type Timeframe = '7d' | '30d' | 'month' | '3m' | '6m' | 'year';

export const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: 'year', label: 'This year' },
];

export function resolveRange(tf: Timeframe, now = new Date()): Range {
  const to = new Date(now);
  switch (tf) {
    case '7d':
      return { from: addDays(startOfDay(now), -6), to, label: 'Last 7 days', days: 7 };
    case '30d':
      return { from: addDays(startOfDay(now), -29), to, label: 'Last 30 days', days: 30 };
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to, label: 'This month', days: daysBetween(from, to) + 1 };
    }
    case '3m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from, to, label: 'Last 3 months', days: daysBetween(from, to) + 1 };
    }
    case '6m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { from, to, label: 'Last 6 months', days: daysBetween(from, to) + 1 };
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from, to, label: 'This year', days: daysBetween(from, to) + 1 };
    }
  }
}

export const addDays = (d: Date, n: number): Date => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
};

export const daysBetween = (a: Date, b: Date): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);

/** The window immediately before [range], of equal length — the comparison baseline. */
export function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime()),
    label: 'Previous period',
    days: range.days,
  };
}

export const inRange = (tx: Transaction, range: Range): boolean => {
  const t = new Date(tx.date).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
};

export type Totals = { income: number; expense: number; net: number; count: number };

/** Income/expense totals. Transfers are excluded — they are neither. */
export function totals(transactions: Transaction[], range: Range): Totals {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || !inRange(tx, range)) continue;
    count++;
    if (signOf(tx.kind) > 0) income += baseOf(tx);
    else expense += baseOf(tx);
  }
  return { income, expense, net: income - expense, count };
}

/**
 * How much an account's balance moved over the window.
 *
 * Transfers count here, unlike in income/expense reporting: money arriving from
 * another of your accounts genuinely changes *this* account's balance.
 */
export function accountDelta(
  account: Account,
  transactions: Transaction[],
  range: Range,
): number {
  let delta = 0;
  for (const tx of transactions) {
    if (tx.userAccountId !== account.id || !inRange(tx, range)) continue;
    delta += signOf(tx.kind) * tx.amount;
  }
  return delta;
}

export type Bucket = { key: string; label: string; value: number; start: Date };

/**
 * Buckets expenses over the window. Short ranges bucket by day, long ones by month,
 * so the bar count stays legible instead of turning into a comb.
 */
export function spendBuckets(transactions: Transaction[], range: Range): Bucket[] {
  const byMonth = range.days > 62;
  const buckets = new Map<string, Bucket>();

  const makeKey = (d: Date) =>
    byMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : startOfDay(d).toISOString().slice(0, 10);

  // Seed every bucket so gaps render as zero rather than collapsing the axis.
  if (byMonth) {
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (cursor <= range.to) {
      buckets.set(makeKey(cursor), {
        key: makeKey(cursor),
        label: cursor.toLocaleDateString(undefined, { month: 'short' }),
        value: 0,
        start: new Date(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = startOfDay(range.from);
    while (cursor <= range.to) {
      buckets.set(makeKey(cursor), {
        key: makeKey(cursor),
        label: String(cursor.getDate()),
        value: 0,
        start: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const tx of transactions) {
    if (isTransfer(tx.kind) || signOf(tx.kind) > 0 || !inRange(tx, range)) continue;
    const bucket = buckets.get(makeKey(new Date(tx.date)));
    if (bucket) bucket.value += baseOf(tx);
  }

  return [...buckets.values()];
}

export type CategorySlice = { label: string; value: number; share: number; count: number };

/** Expense totals per category, largest first. */
export function categoryBreakdown(
  transactions: Transaction[],
  range: Range,
): CategorySlice[] {
  const totalsByLabel = new Map<string, { value: number; count: number }>();
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || signOf(tx.kind) > 0 || !inRange(tx, range)) continue;
    const label = tx.categoryLabel ?? 'Uncategorised';
    const entry = totalsByLabel.get(label) ?? { value: 0, count: 0 };
    entry.value += baseOf(tx);
    entry.count += 1;
    totalsByLabel.set(label, entry);
  }
  const sum = [...totalsByLabel.values()].reduce((s, e) => s + e.value, 0) || 1;
  return [...totalsByLabel.entries()]
    .map(([label, e]) => ({ label, value: e.value, share: e.value / sum, count: e.count }))
    .sort((a, b) => b.value - a.value);
}

export type MonthPoint = { key: string; label: string; income: number; expense: number };

/** Income and expense per calendar month, oldest first. */
export function monthlySeries(transactions: Transaction[], months: number): MonthPoint[] {
  const now = new Date();
  const points: MonthPoint[] = [];
  const index = new Map<string, MonthPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const point = {
      key,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      income: 0,
      expense: 0,
    };
    points.push(point);
    index.set(key, point);
  }

  for (const tx of transactions) {
    if (isTransfer(tx.kind)) continue;
    const d = new Date(tx.date);
    const point = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!point) continue;
    if (signOf(tx.kind) > 0) point.income += baseOf(tx);
    else point.expense += baseOf(tx);
  }

  return points;
}

/** Descriptions seen most often — the recurring things worth noticing. */
export function frequentDescriptions(
  transactions: Transaction[],
  range: Range,
  limit = 6,
): { label: string; count: number; total: number }[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || signOf(tx.kind) > 0 || !inRange(tx, range)) continue;
    const label = (tx.description ?? '').trim();
    if (!label) continue;
    const entry = map.get(label) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += baseOf(tx);
    map.set(label, entry);
  }
  return [...map.entries()]
    .map(([label, e]) => ({ label, ...e }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, limit);
}

/** Percentage change, guarding the divide-by-zero and infinite-growth cases. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/**
 * Net worth over time, reconstructed by walking backwards from today's balances.
 *
 * The API stores current balances, not historical ones, so the only truthful way to draw
 * the past is to undo each transaction in reverse chronological order. Anything before
 * the first recorded transaction is therefore unknown, not zero.
 */
export function balanceSeries(
  accounts: Account[],
  transactions: Transaction[],
  range: Range,
): { label: string; value: number; iso: string }[] {
  const byMonth = range.days > 62;

  const endBalance = accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);

  // Movements after the window's end have to be undone first to find the closing balance.
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  let closing = endBalance;
  for (const tx of sorted) {
    if (new Date(tx.date).getTime() > range.to.getTime()) {
      closing -= signOf(tx.kind) * tx.amount;
    }
  }

  // Net movement per bucket, so the running balance can be rebuilt forwards.
  const deltas = new Map<string, number>();
  const keyOf = (d: Date) =>
    byMonth
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      : startOfDay(d).toISOString().slice(0, 10);

  const points: { key: string; label: string; start: Date }[] = [];
  if (byMonth) {
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (cursor <= range.to) {
      points.push({
        key: keyOf(cursor),
        label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        start: new Date(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = startOfDay(range.from);
    while (cursor <= range.to) {
      points.push({
        key: keyOf(cursor),
        label: cursor.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        start: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const tx of transactions) {
    if (!inRange(tx, range)) continue;
    const k = keyOf(new Date(tx.date));
    deltas.set(k, (deltas.get(k) ?? 0) + signOf(tx.kind) * tx.amount);
  }

  // Opening balance = closing minus everything that happened inside the window.
  const totalDelta = [...deltas.values()].reduce((s, v) => s + v, 0);
  let running = closing - totalDelta;

  return points.map((p) => {
    running += deltas.get(p.key) ?? 0;
    return { label: p.label, value: running, iso: p.start.toISOString() };
  });
}

// ------------------------------------------------------------ new views

export type SankeyData = {
  nodes: { name: string; color?: string }[];
  links: { source: number; target: number; value: number }[];
};

/**
 * Income sources → "Income" → category groups → categories. Small categories fold into
 * "Other" so the diagram stays readable; a Sankey with forty ribbons says nothing.
 */
export function sankeyData(
  transactions: Transaction[],
  range: Range,
  groupOf: (label: string) => string | null,
  colorOf: (label: string) => string,
  maxCategories = 10,
): SankeyData {
  const income = new Map<string, number>();
  const expense = new Map<string, number>();
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || !inRange(tx, range)) continue;
    const label = tx.categoryLabel ?? 'Uncategorised';
    const m = signOf(tx.kind) > 0 ? income : expense;
    m.set(label, (m.get(label) ?? 0) + baseOf(tx));
  }
  const nodes: SankeyData['nodes'] = [];
  const links: SankeyData['links'] = [];
  const idx = new Map<string, number>();
  const node = (name: string, color?: string) => {
    const key = name;
    if (idx.has(key)) return idx.get(key)!;
    nodes.push({ name, color });
    idx.set(key, nodes.length - 1);
    return nodes.length - 1;
  };
  const hub = node('Income');
  for (const [label, v] of [...income.entries()].sort((a, b) => b[1] - a[1])) {
    links.push({ source: node(label, colorOf(label)), target: hub, value: v });
  }
  const totalIn = [...income.values()].reduce((s, v) => s + v, 0);
  const totalOut = [...expense.values()].reduce((s, v) => s + v, 0);
  const ranked = [...expense.entries()].sort((a, b) => b[1] - a[1]);
  const kept = ranked.slice(0, maxCategories);
  const rest = ranked.slice(maxCategories).reduce((s, [, v]) => s + v, 0);
  const byGroup = new Map<string, number>();
  for (const [label, v] of kept) {
    const g = groupOf(label) ?? 'Other';
    byGroup.set(g, (byGroup.get(g) ?? 0) + v);
  }
  if (rest > 0) byGroup.set('Other', (byGroup.get('Other') ?? 0) + rest);
  for (const [g, v] of byGroup) links.push({ source: hub, target: node(g), value: v });
  for (const [label, v] of kept) {
    const g = groupOf(label) ?? 'Other';
    links.push({ source: idx.get(g)!, target: node(`${label} `, colorOf(label)), value: v });
  }
  if (rest > 0) links.push({ source: idx.get('Other')!, target: node('Other categories'), value: rest });
  if (totalIn > totalOut) links.push({ source: hub, target: node('Saved'), value: totalIn - totalOut });
  return { nodes, links };
}

export type HeatCell = { date: Date; iso: string; value: number; level: 0 | 1 | 2 | 3 | 4 };

/** Daily spend for the last `weeks` weeks, Monday-first columns, with quantile levels. */
export function calendarHeat(transactions: Transaction[], weeks = 26, now = new Date()): { cells: HeatCell[]; max: number } {
  const end = startOfDay(now);
  // Start on the Monday `weeks` ago so every column is a full week.
  const start = addDays(end, -(weeks * 7 - 1));
  const startMonday = addDays(start, -((start.getDay() + 6) % 7));
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || signOf(tx.kind) > 0) continue;
    const key = startOfDay(new Date(tx.date)).toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + baseOf(tx));
  }
  const values = [...map.values()].filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
  const t1 = q(0.35), t2 = q(0.6), t3 = q(0.85);
  const cells: HeatCell[] = [];
  const cursor = new Date(startMonday);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const v = map.get(iso) ?? 0;
    const level: HeatCell['level'] = v === 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : v <= t3 ? 3 : 4;
    cells.push({ date: new Date(cursor), iso, value: v, level });
    cursor.setDate(cursor.getDate() + 1);
  }
  return { cells, max: values[values.length - 1] ?? 0 };
}

export type YoYPoint = { label: string; current: number; previous: number };

/** Expense per calendar month this year against the same month last year. */
export function yearOverYear(transactions: Transaction[], now = new Date()): YoYPoint[] {
  const year = now.getFullYear();
  const cur = new Array(12).fill(0);
  const prev = new Array(12).fill(0);
  for (const tx of transactions) {
    if (isTransfer(tx.kind) || signOf(tx.kind) > 0) continue;
    const d = new Date(tx.date);
    if (d.getFullYear() === year) cur[d.getMonth()] += baseOf(tx);
    else if (d.getFullYear() === year - 1) prev[d.getMonth()] += baseOf(tx);
  }
  return cur.map((v, i) => ({
    label: new Date(year, i, 1).toLocaleDateString(undefined, { month: 'short' }),
    current: i <= now.getMonth() ? v : 0,
    previous: prev[i],
  }));
}

/** Per-category spend this period against the previous one — the movers list. */
export function categoryMovers(transactions: Transaction[], range: Range, limit = 5) {
  const cur = new Map(categoryBreakdown(transactions, range).map((c) => [c.label, c.value]));
  const prev = new Map(categoryBreakdown(transactions, previousRange(range)).map((c) => [c.label, c.value]));
  const labels = new Set([...cur.keys(), ...prev.keys()]);
  return [...labels]
    .map((label) => ({ label, current: cur.get(label) ?? 0, previous: prev.get(label) ?? 0, delta: (cur.get(label) ?? 0) - (prev.get(label) ?? 0) }))
    .filter((m) => Math.abs(m.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}
