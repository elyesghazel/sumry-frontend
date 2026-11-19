import type { AdminUser, AuditEntry, Profile } from './types';

/**
 * Helpers for the admin screens. They only ever see profile fields and counts; the admin
 * API returns no amounts, balances or notes.
 */

/** Whether to show admin screens. The server checks the role on every admin route anyway. */
export const isAdmin = (profile: Pick<Profile, 'role'> | null | undefined): boolean => profile?.role === 'ADMIN';

/** `https://host/?invite=CODE`, the link the signup screen reads. */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/?invite=${encodeURIComponent(code)}`;
}

/** `https://host/reset?token=...`, the public page that redeems an admin reset token. */
export function resetLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/reset?token=${encodeURIComponent(token)}`;
}

export type UserSortKey =
  | 'username'
  | 'email'
  | 'role'
  | 'plan'
  | 'status'
  | 'createdAt'
  | 'lastLoginAt'
  | 'accountCount'
  | 'transactionCount';

export type SortDir = 'asc' | 'desc';

/** Case-insensitive match on username, email, role, plan, status or invite hint. */
export function filterUsers(users: AdminUser[], query: string): AdminUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) =>
    [u.username, u.email, u.role, u.plan, u.status, u.inviteCodeHint ?? ''].some((v) => v.toLowerCase().includes(q)),
  );
}

/** Stable sort; missing dates always go last, whichever the direction. */
export function sortUsers(users: AdminUser[], key: UserSortKey, dir: SortDir): AdminUser[] {
  const sign = dir === 'asc' ? 1 : -1;
  return users
    .map((u, i) => ({ u, i }))
    .sort((a, b) => {
      const x = a.u[key];
      const y = b.u[key];
      if (x == null || y == null) {
        if (x == null && y == null) return a.i - b.i;
        return x == null ? 1 : -1;
      }
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
      return c === 0 ? a.i - b.i : c * sign;
    })
    .map(({ u }) => u);
}

/** Numbers sort largest first and dates newest first on the first click; text A to Z. */
export const defaultDir = (key: UserSortKey): SortDir =>
  key === 'createdAt' || key === 'lastLoginAt' || key === 'accountCount' || key === 'transactionCount' ? 'desc' : 'asc';

/** 8123456 -> "7.7 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
  PLAN_SET: 'Plan set',
  LOCK: 'Locked',
  UNLOCK: 'Unlocked',
  DELETE_USER: 'Deleted user',
  PASSWORD_RESET: 'Password reset issued',
  INVITE_CREATE: 'Invite created',
  INVITE_REVOKE: 'Invite revoked',
};

export const auditActionLabel = (action: string): string =>
  ACTION_LABELS[action as AuditEntry['action']] ?? action;

/** One short line from the action's detail, e.g. "PREMIUM" or "invite …ABCD". */
export function auditDetail(entry: Pick<AuditEntry, 'action' | 'detail'>): string {
  const d = entry.detail ?? {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
  switch (entry.action) {
    case 'PLAN_SET':
      return str('plan') ?? '';
    case 'INVITE_CREATE':
    case 'INVITE_REVOKE': {
      const hint = str('codeHint');
      return hint ? `invite …${hint}` : 'invite';
    }
    default:
      return '';
  }
}
