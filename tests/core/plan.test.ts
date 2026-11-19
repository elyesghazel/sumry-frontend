import { describe, expect, it } from 'vitest';
import { ApiError, aiAllowed, blockedBy, createApi, isLimited, planLimitOf, showUpgrade, type Profile } from '../../core';

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'u',
  username: 'test',
  email: 'test@example.com',
  plan: 'FREE',
  limitsEnabled: true,
  limits: { maxAccounts: 2, statementImport: false, statementEmail: false },
  aiEnabled: false,
  ...over,
});

const selfHosted = profile({
  plan: 'PREMIUM',
  limitsEnabled: false,
  limits: { maxAccounts: null, statementImport: true, statementEmail: true },
});

describe('plan limits', () => {
  it('blocks nothing when limits are off', () => {
    expect(isLimited(selfHosted)).toBe(false);
    expect(blockedBy(selfHosted, 'accounts', 50)).toBe(false);
    expect(blockedBy(selfHosted, 'statement_import')).toBe(false);
    expect(blockedBy(selfHosted, 'statement_email')).toBe(false);
    expect(blockedBy(null, 'statement_import')).toBe(false);
  });

  it('blocks the free plan at its limits', () => {
    const p = profile();
    expect(isLimited(p)).toBe(true);
    expect(blockedBy(p, 'accounts', 1)).toBe(false);
    expect(blockedBy(p, 'accounts', 2)).toBe(true);
    expect(blockedBy(p, 'statement_import')).toBe(true);
    expect(blockedBy(p, 'statement_email')).toBe(true);
  });

  it('lets premium through with limits on', () => {
    const p = profile({ plan: 'PREMIUM', limits: { maxAccounts: null, statementImport: true, statementEmail: true } });
    expect(isLimited(p)).toBe(false);
    expect(blockedBy(p, 'accounts', 10)).toBe(false);
  });

  it('offers the upgrade only to free users with limits on', () => {
    expect(showUpgrade(profile())).toBe(true);
    expect(showUpgrade(profile({ plan: 'PREMIUM' }))).toBe(false);
    expect(showUpgrade(selfHosted)).toBe(false);
    expect(showUpgrade(profile({ limitsEnabled: false }))).toBe(false);
    expect(showUpgrade(null)).toBe(false);
  });

  it('reads aiEnabled, falling back for older backends', () => {
    expect(aiAllowed(profile())).toBe(false);
    expect(aiAllowed(profile({ aiEnabled: true }))).toBe(true);
    expect(aiAllowed(null)).toBe(true);
    expect(aiAllowed(null, false)).toBe(false);
  });
});

describe('plan_limit responses', () => {
  const api = createApi({
    baseUrl: 'http://x',
    fetch: async () => ({ ok: false, status: 403, text: async () => '{"error":"plan_limit","limit":"accounts"}' }),
  });

  it('carries the limit name on the error', async () => {
    const err = await api.createAccount('t', 'Third', 0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(planLimitOf(err)).toBe('accounts');
    expect((err as Error).message).not.toBe('plan_limit');
  });

  it('ignores other errors', () => {
    expect(planLimitOf(new ApiError(403, 'Forbidden', { error: 'Forbidden' }))).toBeNull();
    expect(planLimitOf(new ApiError(500, 'x', { error: 'plan_limit', limit: 'accounts' }))).toBeNull();
    expect(planLimitOf(new Error('x'))).toBeNull();
  });
});
