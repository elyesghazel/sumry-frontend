import { ApiError } from './api';
import type { PlanLimitName, Profile } from './types';

/**
 * Plan limits as the apps show them. Everything here is a no-op unless the backend
 * enforces plans (`limitsEnabled`), so self-hosted instances never see any of it.
 */

export const PREMIUM_OFFER = 'Premium - 20 CHF once';

/** The limit a failed call ran into, or null when it was not a plan_limit 403. */
export function planLimitOf(e: unknown): PlanLimitName | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  const b = e.body as { error?: unknown; limit?: unknown } | null;
  if (!b || b.error !== 'plan_limit') return null;
  return b.limit === 'accounts' || b.limit === 'statement_import' || b.limit === 'statement_email' ? b.limit : null;
}

/** True when this user is on the free plan of an instance that enforces plans. */
export function isLimited(p: Profile | null | undefined): boolean {
  return !!p && p.limitsEnabled && p.plan === 'FREE';
}

/** Whether `limit` blocks this user right now; `accountCount` is needed for 'accounts'. */
export function blockedBy(p: Profile | null | undefined, limit: PlanLimitName, accountCount = 0): boolean {
  if (!p || !p.limitsEnabled) return false;
  switch (limit) {
    case 'accounts':
      return p.limits.maxAccounts != null && accountCount >= p.limits.maxAccounts;
    case 'statement_import':
      return !p.limits.statementImport;
    case 'statement_email':
      return !p.limits.statementEmail;
  }
}

/** One calm sentence on what the free plan leaves out. */
export function planLimitText(limit: PlanLimitName, maxAccounts?: number | null): string {
  switch (limit) {
    case 'accounts':
      return maxAccounts != null
        ? `The free plan has room for ${maxAccounts} accounts. Premium removes the limit.`
        : 'The free plan has no room for another account. Premium removes the limit.';
    case 'statement_import':
      return 'Statement import is part of Premium. Entries by hand and quick add stay free.';
    case 'statement_email':
      return 'Emailing the statement is part of Premium. You can still open it here.';
  }
}

/** The AI features are shown only when the backend says so; older backends fall back to `fallback`. */
export function aiAllowed(p: Profile | null | undefined, fallback = true): boolean {
  return p ? p.aiEnabled : fallback;
}
