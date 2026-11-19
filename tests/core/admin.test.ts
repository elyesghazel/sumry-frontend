import { describe, expect, it } from 'vitest';
import {
  auditActionLabel,
  auditDetail,
  createApi,
  filterUsers,
  formatBytes,
  inviteLink,
  isAdmin,
  resetLink,
  sortUsers,
  type AdminUser,
  type FetchLike,
} from '../../core';

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeApi(status: number, response: unknown) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    return { ok: status < 400, status, text: async () => (response === undefined ? '' : JSON.stringify(response)) };
  };
  return { api: createApi({ baseUrl: 'https://sumry.test', fetch }), calls };
}

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: 'u', username: 'u', email: 'u@example.com', role: 'USER', plan: 'FREE', status: 'active',
  createdAt: null, lastLoginAt: null, lockedAt: null, inviteCodeHint: null, accountCount: 0, transactionCount: 0,
  ...over,
});

describe('admin api', () => {
  it('reads users, stats and a page of the audit log with the token', async () => {
    const { api, calls } = fakeApi(200, []);
    await api.adminUsers('tok');
    await api.adminStats('tok');
    await api.adminAudit('tok', 2, 25);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', 'https://sumry.test/api/admin/users'],
      ['GET', 'https://sumry.test/api/admin/stats'],
      ['GET', 'https://sumry.test/api/admin/audit?page=2&size=25'],
    ]);
    expect(calls.every((c) => c.headers.Authorization === 'Bearer tok')).toBe(true);
  });

  it('sets the plan, locks, unlocks, deletes and issues a reset', async () => {
    const { api, calls } = fakeApi(200, {});
    await api.adminSetPlan('tok', 'id1', 'PREMIUM');
    await api.adminLock('tok', 'id1');
    await api.adminUnlock('tok', 'id1');
    await api.adminDeleteUser('tok', 'id1');
    await api.adminPasswordReset('tok', 'id1');
    expect(calls.map((c) => [c.method, c.url.replace('https://sumry.test', '')])).toEqual([
      ['POST', '/api/admin/users/id1/plan'],
      ['POST', '/api/admin/users/id1/lock'],
      ['POST', '/api/admin/users/id1/unlock'],
      ['DELETE', '/api/admin/users/id1'],
      ['POST', '/api/admin/users/id1/password-reset'],
    ]);
    expect(JSON.parse(calls[0].body!)).toEqual({ plan: 'PREMIUM' });
    expect(calls[3].body).toBeUndefined();
  });

  it('creates, lists and revokes invites', async () => {
    const { api, calls } = fakeApi(200, {});
    await api.createInvite('tok', { expiresInDays: 7, note: '' });
    await api.createInvite('tok');
    await api.invites('tok');
    await api.revokeInvite('tok', 'inv1');
    expect(JSON.parse(calls[0].body!)).toEqual({ expiresInDays: 7, note: null });
    expect(JSON.parse(calls[1].body!)).toEqual({ expiresInDays: null, note: null });
    expect(calls[2]).toMatchObject({ method: 'GET', url: 'https://sumry.test/api/admin/invites' });
    expect(calls[3]).toMatchObject({ method: 'DELETE', url: 'https://sumry.test/api/admin/invites/inv1' });
  });

  it('redeems a reset token without a bearer token', async () => {
    const { api, calls } = fakeApi(204, undefined);
    await api.resetPassword('reset-token', 'a long new password');
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://sumry.test/api/users/password-reset' });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(JSON.parse(calls[0].body!)).toEqual({ token: 'reset-token', newPassword: 'a long new password' });
  });

  it('surfaces a used reset token as an error', async () => {
    const { api } = fakeApi(400, { error: 'This reset link is invalid or has expired' });
    await expect(api.resetPassword('x', 'a long new password')).rejects.toThrow('invalid or has expired');
  });
});

describe('admin helpers', () => {
  it('shows admin screens only for role ADMIN', () => {
    expect(isAdmin({ role: 'ADMIN' })).toBe(true);
    expect(isAdmin({ role: 'USER' })).toBe(false);
    expect(isAdmin({ role: 'DEBUG' })).toBe(false);
    expect(isAdmin({})).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('builds invite and reset links', () => {
    expect(inviteLink('https://sumry.test/', 'AB CD')).toBe('https://sumry.test/?invite=AB%20CD');
    expect(resetLink('https://sumry.test', 'a_b-c')).toBe('https://sumry.test/reset?token=a_b-c');
  });

  it('filters on profile fields', () => {
    const users = [user({ id: '1', username: 'Alice' }), user({ id: '2', username: 'bob', status: 'locked' }), user({ id: '3', inviteCodeHint: 'WXYZ' })];
    expect(filterUsers(users, 'ali').map((u) => u.id)).toEqual(['1']);
    expect(filterUsers(users, 'LOCKED').map((u) => u.id)).toEqual(['2']);
    expect(filterUsers(users, 'wxyz').map((u) => u.id)).toEqual(['3']);
    expect(filterUsers(users, '  ')).toHaveLength(3);
  });

  it('sorts text, numbers and dates, missing dates last', () => {
    const users = [
      user({ id: 'a', username: 'carol', createdAt: '2026-11-01T00:00:00Z', transactionCount: 5 }),
      user({ id: 'b', username: 'Alice', createdAt: null, transactionCount: 50 }),
      user({ id: 'c', username: 'bob', createdAt: '2026-11-10T00:00:00Z', transactionCount: 0 }),
    ];
    expect(sortUsers(users, 'username', 'asc').map((u) => u.id)).toEqual(['b', 'c', 'a']);
    expect(sortUsers(users, 'transactionCount', 'desc').map((u) => u.id)).toEqual(['b', 'a', 'c']);
    expect(sortUsers(users, 'createdAt', 'desc').map((u) => u.id)).toEqual(['c', 'a', 'b']);
    expect(sortUsers(users, 'createdAt', 'asc').map((u) => u.id)).toEqual(['a', 'c', 'b']);
  });

  it('formats sizes and audit rows', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(8123456)).toBe('7.7 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB');
    expect(auditActionLabel('LOCK')).toBe('Locked');
    expect(auditActionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(auditDetail({ action: 'PLAN_SET', detail: { plan: 'PREMIUM' } })).toBe('PREMIUM');
    expect(auditDetail({ action: 'INVITE_REVOKE', detail: { codeHint: 'ABCD' } })).toBe('invite …ABCD');
    expect(auditDetail({ action: 'LOCK', detail: {} })).toBe('');
  });
});
