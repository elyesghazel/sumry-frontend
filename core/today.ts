import type { Account, Budget, BudgetProgress, Occurrence, SafeToSpend, Transaction } from './types';
import { addDays, categoryBreakdown, daysBetween, pctChange, type CategorySlice, type Range } from './analytics';
import { baseOf, isTransfer, isoDay, signOf, startOfDay } from './format';

/**
 * Pure derivations behind the Today screen on both platforms: the "Needs you" inbox,
 * today's allowance and the projected balance line.
 */

/** Local calendar day of an API date: date-only strings as they are, datetimes in local time. */
export const dayOf = (iso: string): string => (iso.length === 10 ? iso : isoDay(new Date(iso)));

const parseDay = (day: string): Date => new Date(`${day.slice(0, 10)}T00:00:00`);

// ------------------------------------------------------------------ needs you

export type NeedsYouState = {
  accounts: Account[];
  transactions: Transaction[];
  /** Planned occurrences, overdue ones included (GET /planned/upcoming). */
  upcoming: Occurrence[];
  /** Budget progress for the current period. */
  progress: BudgetProgress[];
  /** Budget definitions; lets the month-close card say which budgets last month hit. */
  budgets?: Budget[];
};

export type OverdueItem = { kind: 'overdue'; id: string; occurrence: Occurrence; daysLate: number };
export type UncategorisedItem = {
  kind: 'uncategorised';
  id: 'uncategorised';
  count: number;
  /** Base-currency sum of the uncategorised entries. */
  total: number;
  transactionIds: string[];
};
export type BudgetOverItem = { kind: 'budgetOver'; id: string; budget: BudgetProgress; over: number };
export type ReconcileItem = {
  kind: 'reconcile';
  id: string;
  account: Account;
  lastReconciledAt: string | null;
  /** Days since the last check; null when it was never checked. */
  daysSince: number | null;
};
export type MonthCloseItem = {
  kind: 'monthClose';
  id: string;
  /** The month being closed, `YYYY-MM` (the one before `now`). */
  month: string;
  from: string;
  to: string;
  spent: number;
  previousSpent: number;
  /** Percent change against the month before; null when that month had nothing. */
  change: number | null;
  topCategories: CategorySlice[];
  /** Monthly budgets whose category spend reached the limit in that month. */
  budgetsHit: { categoryLabel: string; limit: number; spent: number }[];
};

export type NeedsYouItem = OverdueItem | UncategorisedItem | BudgetOverItem | ReconcileItem | MonthCloseItem;
export type NeedsYouKind = NeedsYouItem['kind'];

/** Days without a bank check before an account asks to be reconciled. */
export const RECONCILE_AFTER_DAYS = 14;

/**
 * Everything that wants the user's attention today, most urgent first. Each item has a
 * stable `id` so a UI can snooze it.
 *
 * An account with `lastReconciledAt: null` asks for a check only when it has entries (a
 * fresh empty account has nothing to drift); `undefined` means an older backend that does
 * not report it, which never asks.
 */
export function needsYou(state: NeedsYouState, now: Date = new Date()): NeedsYouItem[] {
  const today = isoDay(now);
  const todayStart = startOfDay(now);
  const items: NeedsYouItem[] = [];

  // Month close on the 1st to the 3rd.
  if (now.getDate() <= 3) {
    items.push(monthClose(state, now));
  }

  for (const o of state.upcoming) {
    const day = dayOf(o.date);
    if (!o.overdue && day >= today) continue;
    items.push({
      kind: 'overdue',
      id: `overdue:${o.plannedId}:${day}`,
      occurrence: o,
      daysLate: Math.max(0, daysBetween(parseDay(day), todayStart)),
    });
  }

  for (const b of state.progress) {
    const limit = b.effectiveLimit ?? b.limitAmount;
    if (b.spentAmount <= limit) continue;
    items.push({ kind: 'budgetOver', id: `budgetOver:${b.budgetId}:${b.periodStart}`, budget: b, over: b.spentAmount - limit });
  }

  const loose = state.transactions.filter((t) => !isTransfer(t.kind) && !t.categoryLabel);
  if (loose.length > 0) {
    items.push({
      kind: 'uncategorised',
      id: 'uncategorised',
      count: loose.length,
      total: loose.reduce((s, t) => s + baseOf(t), 0),
      transactionIds: loose.map((t) => t.id),
    });
  }

  const withEntries = new Set(state.transactions.map((t) => t.userAccountId));
  for (const a of state.accounts) {
    if (a.lastReconciledAt === undefined) continue;
    if (a.lastReconciledAt === null) {
      if (!withEntries.has(a.id)) continue;
      items.push({ kind: 'reconcile', id: `reconcile:${a.id}`, account: a, lastReconciledAt: null, daysSince: null });
      continue;
    }
    const since = daysBetween(new Date(a.lastReconciledAt), todayStart);
    if (since < RECONCILE_AFTER_DAYS) continue;
    items.push({ kind: 'reconcile', id: `reconcile:${a.id}`, account: a, lastReconciledAt: a.lastReconciledAt, daysSince: since });
  }

  return items;
}

const monthRange = (year: number, month: number): Range => {
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { from, to, label: '', days: daysBetween(from, to) + 1 };
};

const expenseIn = (transactions: Transaction[], range: Range): number => {
  let sum = 0;
  for (const t of transactions) {
    if (isTransfer(t.kind) || signOf(t.kind) > 0) continue;
    const ms = new Date(t.date).getTime();
    if (ms >= range.from.getTime() && ms <= range.to.getTime()) sum += baseOf(t);
  }
  return sum;
};

function monthClose(state: NeedsYouState, now: Date): MonthCloseItem {
  const last = monthRange(now.getFullYear(), now.getMonth() - 1);
  const before = monthRange(now.getFullYear(), now.getMonth() - 2);
  const spent = expenseIn(state.transactions, last);
  const previousSpent = expenseIn(state.transactions, before);
  const slices = categoryBreakdown(state.transactions, last);
  const byLabel = new Map(slices.map((s) => [s.label, s.value]));
  const month = isoDay(last.from).slice(0, 7);

  const budgetsHit = (state.budgets ?? [])
    .filter((b) => b.period === 'MONTHLY')
    .map((b) => ({ categoryLabel: b.categoryLabel, limit: b.limitAmount, spent: byLabel.get(b.categoryLabel) ?? 0 }))
    .filter((b) => b.limit > 0 && b.spent >= b.limit)
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);

  return {
    kind: 'monthClose',
    id: `monthClose:${month}`,
    month,
    from: isoDay(last.from),
    to: isoDay(last.to),
    spent,
    previousSpent,
    change: pctChange(spent, previousSpent),
    topCategories: slices.slice(0, 3),
    budgetsHit,
  };
}

// ------------------------------------------------------------------ daily allowance

export type DailyAllowance = {
  /** What today may cost, fixed at the start of the day. */
  perDay: number;
  spentToday: number;
  /** perDay − spentToday; negative once today is over. */
  leftToday: number;
  /** spentToday / perDay for a meter; 1 when there was no allowance but something was spent. */
  ratio: number;
  over: boolean;
};

/**
 * Today's allowance from safe-to-spend.
 *
 * The backend divides what is left *now* by the days to the horizon, so its `perDay` drops
 * with every purchase. To get a fixed allowance for today, today's spending is added back
 * before dividing. Only expenses on the accounts safe-to-spend looked at count; anything
 * not dated today is ignored, so passing more than today's entries is harmless.
 */
export function dailyAllowance(
  safe: SafeToSpend | null | undefined,
  todaysTransactions: Transaction[],
  now: Date = new Date(),
): DailyAllowance {
  const today = safe?.today ? safe.today.slice(0, 10) : isoDay(now);
  const scope = safe?.accountIds?.length ? new Set(safe.accountIds) : safe?.accountId ? new Set([safe.accountId]) : null;

  let spentToday = 0;
  for (const t of todaysTransactions) {
    if (t.kind !== 'EXPENSE' || dayOf(t.date) !== today) continue;
    if (scope && (!t.userAccountId || !scope.has(t.userAccountId))) continue;
    spentToday += baseOf(t);
  }

  const days = Math.max(1, safe?.daysToHorizon ?? 1);
  const perDay = safe ? Math.max(0, Math.floor(((safe.safeToSpend + spentToday) / days) * 100) / 100) : 0;
  const leftToday = perDay - spentToday;
  const ratio = perDay > 0 ? spentToday / perDay : spentToday > 0 ? 1 : 0;
  return { perDay, spentToday, leftToday, ratio, over: leftToday < 0 };
}

// ------------------------------------------------------------------ projected balance

export type BalancePoint = { date: string; balance: number };
export type BalanceProjection = { start: number; points: BalancePoint[]; lowest: BalancePoint };

/**
 * Day-by-day balance of `accounts` (base currency) over the next `days` days, today
 * included, from the planned occurrences. Overdue occurrences land on today. Transfers
 * between two of the given accounts cancel out; a transfer to an account outside them
 * leaves, one from outside arrives. Each point is the balance at the end of that day.
 */
export function projectBalance(
  accounts: Account[],
  upcoming: Occurrence[],
  days: number,
  now: Date = new Date(),
): BalanceProjection {
  const ids = new Set(accounts.map((a) => a.id));
  const names = new Set(accounts.map((a) => a.accountName));
  // Occurrences are in account currency; the account's own base/current ratio converts them.
  const rate = new Map(
    accounts.map((a) => [a.id, a.currentBalance && a.baseBalance != null ? a.baseBalance / a.currentBalance : 1]),
  );
  const start = accounts.reduce((s, a) => s + (a.baseBalance ?? a.currentBalance ?? 0), 0);
  const today = isoDay(now);
  const span = Math.max(1, Math.floor(days));
  const dayKeys: string[] = [];
  for (let i = 0; i < span; i++) dayKeys.push(isoDay(addDays(startOfDay(now), i)));

  const deltas = new Map<string, number>();
  for (const o of upcoming) {
    let day = dayOf(o.date);
    if (day < today) day = today;
    if (day > dayKeys[dayKeys.length - 1]) continue;
    const fromIn = ids.has(o.accountId);
    let delta = 0;
    if (isTransfer(o.kind)) {
      const toIn = o.toAccountName != null && names.has(o.toAccountName);
      if (fromIn === toIn) continue;
      delta = (fromIn ? -1 : 1) * o.amount * (rate.get(o.accountId) ?? 1);
    } else {
      if (!fromIn) continue;
      delta = signOf(o.kind) * o.amount * (rate.get(o.accountId) ?? 1);
    }
    deltas.set(day, (deltas.get(day) ?? 0) + delta);
  }

  let running = start;
  const points = dayKeys.map((date) => {
    running += deltas.get(date) ?? 0;
    return { date, balance: Math.round(running * 100) / 100 };
  });
  const lowest = points.reduce((lo, p) => (p.balance < lo.balance ? p : lo), points[0]);
  return { start, points, lowest };
}
