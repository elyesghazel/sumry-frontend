import type { BudgetProgress, Goal } from './types';

/**
 * "Pots": budgets and savings goals in one list. Merged on the client; the backend keeps
 * them apart.
 */

export type PotStatus = 'ok' | 'warn' | 'over' | 'behind' | 'done';

type PotBase = {
  id: string;
  name: string;
  color: string | null;
  /** Spent so far (budget) or saved so far (goal), base currency. */
  current: number;
  /** The effective limit (budget, carry included) or the target (goal). */
  target: number;
  /** current / target, unclamped; 0 when there is no target. */
  ratio: number;
  /** target − current; negative when a budget is over. */
  remaining: number;
  status: PotStatus;
};

export type BudgetPot = PotBase & { kind: 'budget'; budget: BudgetProgress };
export type GoalPot = PotBase & { kind: 'goal'; goal: Goal };
export type Pot = BudgetPot | GoalPot;

/** Share of a budget at which it starts to warn. */
export const POT_WARN_AT = 0.8;

export function budgetPot(b: BudgetProgress): BudgetPot {
  const target = b.effectiveLimit ?? b.limitAmount;
  const ratio = target > 0 ? b.spentAmount / target : b.spentAmount > 0 ? 1 : 0;
  const status: PotStatus = b.spentAmount > target ? 'over' : ratio >= POT_WARN_AT || b.pace === 'over' ? 'warn' : 'ok';
  return {
    kind: 'budget',
    id: b.budgetId,
    name: b.categoryLabel,
    color: b.categoryColor,
    current: b.spentAmount,
    target,
    ratio,
    remaining: target - b.spentAmount,
    status,
    budget: b,
  };
}

export function goalPot(g: Goal): GoalPot {
  const ratio = g.targetAmount > 0 ? g.current / g.targetAmount : 0;
  const status: PotStatus = g.achieved ? 'done' : g.onTrack === false ? 'behind' : 'ok';
  return {
    kind: 'goal',
    id: g.id,
    name: g.name,
    color: g.color,
    current: g.current,
    target: g.targetAmount,
    ratio,
    remaining: g.targetAmount - g.current,
    status,
    goal: g,
  };
}

/** Budgets first, fullest first; then active goals in the order the backend sent them. */
export function mergePots(budgets: BudgetProgress[], goals: Goal[]): Pot[] {
  const b = budgets.map(budgetPot).sort((x, y) => y.ratio - x.ratio);
  const g = goals.filter((x) => x.isActive !== false).map(goalPot);
  return [...b, ...g];
}
