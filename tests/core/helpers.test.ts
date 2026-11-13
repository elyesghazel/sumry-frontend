import { describe, expect, it } from 'vitest';
import {
  dailyAllowance,
  maskIban,
  maskIbansIn,
  mergePots,
  needsYou,
  projectBalance,
  type Account,
  type BudgetProgress,
  type Goal,
  type Occurrence,
  type SafeToSpend,
  type Transaction,
} from '../../core';

// Synthetic fixtures only; the IBAN is the standard documentation example.
const FAKE_IBAN = 'CH93 0076 2011 6238 5295 7';

const account = (over: Partial<Account> = {}): Account => ({
  id: 'a1',
  userId: 'u',
  accountName: 'Main',
  currentBalance: 1000,
  currency: 'CHF',
  spending: true,
  baseBalance: 1000,
  baseCurrency: 'CHF',
  ...over,
});

let n = 0;
const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  amount: 10,
  description: null,
  categoryId: null,
  categoryLabel: 'Food',
  kind: 'EXPENSE',
  transferGroupId: null,
  date: '2026-11-13T12:00:00',
  userAccountId: 'a1',
  userId: 'u',
  balanceBefore: null,
  balanceAfter: null,
  currency: 'CHF',
  fxRate: 1,
  baseAmount: over.amount ?? 10,
  ...over,
});

const occ = (over: Partial<Occurrence> = {}): Occurrence => ({
  plannedId: 'p1',
  name: 'Rent',
  amount: 100,
  kind: 'EXPENSE',
  date: '2026-11-15',
  categoryLabel: null,
  categoryColor: null,
  accountId: 'a1',
  accountName: 'Main',
  currency: 'CHF',
  toAccountName: null,
  autoBook: false,
  overdue: false,
  ...over,
});

const progress = (over: Partial<BudgetProgress> = {}): BudgetProgress => ({
  budgetId: 'b1',
  categoryLabel: 'Food',
  categoryColor: null,
  limitAmount: 100,
  spentAmount: 50,
  remaining: 50,
  percentage: 50,
  period: 'MONTHLY',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  daysLeft: 17,
  rollover: false,
  carry: 0,
  effectiveLimit: 100,
  pace: 'under',
  perDayLeft: 3,
  ...over,
});

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Bike',
  targetAmount: 1000,
  targetDate: null,
  accountId: null,
  accountName: null,
  current: 250,
  remaining: 750,
  percentage: 25,
  monthsLeft: null,
  requiredPerMonth: null,
  onTrack: null,
  achieved: false,
  color: null,
  icon: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00',
  ...over,
});

const now = new Date(2026, 10, 13, 15, 0); // 13 Nov 2026, local time

describe('maskIban', () => {
  it('keeps the country code and the last four characters', () => {
    expect(maskIban(FAKE_IBAN)).toBe('CH•• … 2957');
    expect(maskIban('ch9300762011623852957')).toBe('CH•• … 2957');
  });
  it('handles empty and short input', () => {
    expect(maskIban(null)).toBe('');
    expect(maskIban('')).toBe('');
    expect(maskIban('1234')).toBe('•••• 1234');
  });
  it('masks IBANs inside text without eating the next word', () => {
    expect(maskIbansIn(`Transfer to ${FAKE_IBAN} TWINT`)).toBe('Transfer to CH•• … 2957 TWINT');
    expect(maskIbansIn('Paid CH9300762011623852957.')).toBe('Paid CH•• … 2957.');
    expect(maskIbansIn('Coop 1234 Zurich')).toBe('Coop 1234 Zurich');
  });
});

describe('dailyAllowance', () => {
  const safe: SafeToSpend = {
    balance: 1000,
    accountId: null,
    accountIds: ['a1'],
    today: '2026-11-13',
    horizon: '2026-11-23',
    daysToHorizon: 10,
    horizonReason: 'payday',
    upcomingExpenses: 0,
    upcomingTransfersOut: 0,
    safeToSpend: 470,
    perDay: 47,
    upcoming: [],
  };

  it('adds today back so the allowance is fixed for the day', () => {
    const r = dailyAllowance(safe, [tx({ amount: 30 })], now);
    expect(r.perDay).toBe(50);
    expect(r.spentToday).toBe(30);
    expect(r.leftToday).toBe(20);
    expect(r.ratio).toBeCloseTo(0.6);
    expect(r.over).toBe(false);
  });
  it('ignores income, other days and accounts outside safe-to-spend', () => {
    const r = dailyAllowance(
      safe,
      [
        tx({ amount: 30, kind: 'INCOME' }),
        tx({ amount: 30, date: '2026-11-12T12:00:00' }),
        tx({ amount: 30, userAccountId: 'savings' }),
      ],
      now,
    );
    expect(r.spentToday).toBe(0);
    expect(r.perDay).toBe(47);
  });
  it('copes with no safe-to-spend', () => {
    expect(dailyAllowance(null, [tx()], now)).toMatchObject({ perDay: 0, ratio: 1, over: true });
  });
});

describe('projectBalance', () => {
  it('walks the balance forward and finds the lowest point', () => {
    const r = projectBalance(
      [account()],
      [occ({ date: '2026-11-15', amount: 800 }), occ({ date: '2026-11-17', amount: 500, kind: 'INCOME' })],
      7,
      now,
    );
    expect(r.points).toHaveLength(7);
    expect(r.points[0]).toEqual({ date: '2026-11-13', balance: 1000 });
    expect(r.points[2]).toEqual({ date: '2026-11-15', balance: 200 });
    expect(r.points[6].balance).toBe(700);
    expect(r.lowest).toEqual({ date: '2026-11-15', balance: 200 });
  });
  it('puts overdue items on today and ignores ones past the window', () => {
    const r = projectBalance([account()], [occ({ date: '2026-11-01', amount: 50 }), occ({ date: '2026-12-30' })], 3, now);
    expect(r.points.map((p) => p.balance)).toEqual([950, 950, 950]);
  });
  it('cancels transfers inside the set and counts ones leaving it', () => {
    const accounts = [account(), account({ id: 'a2', accountName: 'Cash', currentBalance: 0, baseBalance: 0 })];
    const inside = occ({ kind: 'TRANSFER_OUT', toAccountName: 'Cash', date: '2026-11-13' });
    const leaving = occ({ kind: 'TRANSFER_OUT', toAccountName: 'Savings', date: '2026-11-14', amount: 300 });
    const r = projectBalance(accounts, [inside, leaving], 2, now);
    expect(r.points.map((p) => p.balance)).toEqual([1000, 700]);
  });
  it('converts foreign-currency accounts with their own rate', () => {
    const eur = account({ currency: 'EUR', currentBalance: 100, baseBalance: 95 });
    const r = projectBalance([eur], [occ({ amount: 10, date: '2026-11-13', currency: 'EUR' })], 1, now);
    expect(r.start).toBe(95);
    expect(r.points[0].balance).toBe(85.5);
  });
});

describe('needsYou', () => {
  const base = { accounts: [] as Account[], transactions: [] as Transaction[], upcoming: [] as Occurrence[], progress: [] as BudgetProgress[] };

  it('is empty when nothing needs attention mid-month', () => {
    expect(needsYou(base, now)).toEqual([]);
  });
  it('lists overdue plans, budgets over, uncategorised entries', () => {
    const items = needsYou(
      {
        ...base,
        upcoming: [occ({ date: '2026-11-10', overdue: true }), occ({ plannedId: 'p2', date: '2026-11-20' })],
        progress: [progress({ spentAmount: 130 }), progress({ budgetId: 'b2' })],
        transactions: [tx({ categoryLabel: null, amount: 7 }), tx({ categoryLabel: null, kind: 'TRANSFER_OUT' }), tx()],
      },
      now,
    );
    expect(items.map((i) => i.kind)).toEqual(['overdue', 'budgetOver', 'uncategorised']);
    expect(items[0]).toMatchObject({ id: 'overdue:p1:2026-11-10', daysLate: 3 });
    expect(items[1]).toMatchObject({ over: 30 });
    expect(items[2]).toMatchObject({ count: 1, total: 7 });
  });
  it('asks to reconcile stale accounts, and never-checked ones only with entries', () => {
    const items = needsYou(
      {
        ...base,
        accounts: [
          account({ id: 'old', lastReconciledAt: '2026-10-20T09:00:00' }),
          account({ id: 'fresh', lastReconciledAt: '2026-11-10T09:00:00' }),
          account({ id: 'never-used', lastReconciledAt: null }),
          account({ id: 'never-checked', lastReconciledAt: null }),
          account({ id: 'old-backend' }),
        ],
        transactions: [tx({ userAccountId: 'never-checked' }), tx({ userAccountId: 'old-backend' })],
      },
      now,
    );
    const rec = items.filter((i) => i.kind === 'reconcile');
    expect(rec.map((i) => i.id)).toEqual(['reconcile:old', 'reconcile:never-checked']);
    expect(rec[0]).toMatchObject({ daysSince: 24 });
    expect(rec[1]).toMatchObject({ daysSince: null });
  });
  it('closes the month on the 1st to the 3rd', () => {
    const items = needsYou(
      {
        ...base,
        transactions: [
          tx({ amount: 120, date: '2026-10-05T10:00:00' }),
          tx({ amount: 40, categoryLabel: 'Fun', date: '2026-10-20T10:00:00' }),
          tx({ amount: 80, date: '2026-09-10T10:00:00' }),
        ],
        budgets: [
          { id: 'b1', limitAmount: 100, categoryLabel: 'Food', categoryColor: null, period: 'MONTHLY', rollover: false, startDay: 1 },
          { id: 'b2', limitAmount: 100, categoryLabel: 'Fun', categoryColor: null, period: 'MONTHLY', rollover: false, startDay: 1 },
        ],
      },
      new Date(2026, 10, 2, 9, 0),
    );
    expect(items[0]).toMatchObject({
      kind: 'monthClose',
      id: 'monthClose:2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      spent: 160,
      previousSpent: 80,
      change: 100,
      budgetsHit: [{ categoryLabel: 'Food', limit: 100, spent: 120 }],
    });
    expect(needsYou(base, new Date(2026, 10, 4)).some((i) => i.kind === 'monthClose')).toBe(false);
  });
});

describe('mergePots', () => {
  it('puts budgets first by fullness, then active goals', () => {
    const pots = mergePots(
      [progress({ budgetId: 'low', spentAmount: 10 }), progress({ budgetId: 'over', spentAmount: 120 }), progress({ budgetId: 'warn', spentAmount: 85 })],
      [goal(), goal({ id: 'done', achieved: true, current: 1000 }), goal({ id: 'off', isActive: false })],
    );
    expect(pots.map((p) => `${p.kind}:${p.id}:${p.status}`)).toEqual([
      'budget:over:over',
      'budget:warn:warn',
      'budget:low:ok',
      'goal:g1:ok',
      'goal:done:done',
    ]);
    expect(pots[0]).toMatchObject({ current: 120, target: 100, remaining: -20 });
    expect(pots[3]).toMatchObject({ ratio: 0.25, remaining: 750 });
  });
});
