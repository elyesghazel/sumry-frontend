import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  auditActionLabel,
  auditDetail,
  defaultDir,
  filterUsers,
  formatBytes,
  formatLongDate,
  formatShortDate,
  inviteLink,
  isAdmin,
  resetLink,
  sortUsers,
  type AdminStats,
  type AdminUser,
  type AuditPage,
  type Invite,
  type PasswordResetToken,
  type SortDir,
  type UserSortKey,
} from '../../core';
import { api } from '../api';
import { PageHead } from '../components/Nav';
import { navigate, useStore, type Route } from '../store';
import { Empty, ErrorLine, Field, Modal, Section, Segmented, Switch, Tag } from '../ui';

/**
 * Instance admin: users, invites and the audit log. Profile fields and counts only; the
 * admin API never returns amounts, balances or notes, and this page shows none.
 */

type Tab = 'users' | 'invites' | 'audit';
const TABS: { key: Tab; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'invites', label: 'Invites' },
  { key: 'audit', label: 'Audit log' },
];

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const when = (iso: string | null) => (iso ? formatShortDate(iso) : '—');
const whenLong = (iso: string | null) => (iso ? formatLongDate(iso) : '—');
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Copies to the clipboard, or asks for a manual copy where the browser refuses. */
function useCopy() {
  const { toast } = useStore();
  return useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(`${what} copied`);
      } catch {
        toast(`Select the ${what.toLowerCase()} and copy it`);
      }
    },
    [toast],
  );
}

export function Admin({ route }: { route: Route }) {
  const { profile } = useStore();
  const raw = route.params.get('tab');
  const tab: Tab = TABS.some((t) => t.key === raw) ? (raw as Tab) : 'users';

  // The profile loads with the shell; until then there is nothing to decide.
  if (!profile) return <div className="spinner" />;
  if (!isAdmin(profile)) {
    return (
      <>
        <PageHead title="Admin" />
        <Empty>This page is for the admins of this instance.</Empty>
      </>
    );
  }

  return (
    <>
      <PageHead title="Admin" sub="Users, invites and what admins did. No finance data is shown here." />
      <div className="tabs-row"><Segmented options={TABS} value={tab} onChange={(t) => navigate('admin', t === 'users' ? undefined : { tab: t })} /></div>
      {tab === 'users' ? <Users /> : null}
      {tab === 'invites' ? <Invites /> : null}
      {tab === 'audit' ? <Audit /> : null}
    </>
  );
}

// ------------------------------------------------------------------- users

function Tile({ label, value, foot }: { label: string; value: ReactNode; foot?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value num">{value}</div>
      {foot ? <div className="foot">{foot}</div> : null}
    </div>
  );
}

/** Twelve weekly bars, last one the current week. */
function SignupBars({ weeks }: { weeks: AdminStats['signupsPerWeek'] }) {
  const max = Math.max(1, ...weeks.map((w) => w.signups));
  return (
    <div className="admin-bars" aria-label="Signups per week, last 12 weeks">
      {weeks.map((w) => (
        <span key={w.weekStart} title={`Week of ${formatShortDate(w.weekStart)}: ${w.signups}`} style={{ height: `${Math.max(6, (w.signups / max) * 100)}%`, opacity: w.signups ? 1 : 0.35 }} />
      ))}
    </div>
  );
}

function StatsTiles({ stats }: { stats: AdminStats | null }) {
  const weeks = stats?.signupsPerWeek ?? [];
  const thisWeek = weeks.at(-1)?.signups ?? 0;
  const total12 = weeks.reduce((s, w) => s + w.signups, 0);
  return (
    <div className="stats">
      <Tile label="Users" value={stats ? stats.totalUsers : '…'} />
      <Tile label="Premium" value={stats ? stats.premiumUsers : '…'} foot={<span className="tiny faint">stored plan</span>} />
      <Tile label="Locked" value={stats ? stats.lockedUsers : '…'} />
      <Tile label="Signups" value={stats ? thisWeek : '…'} foot={stats ? <><SignupBars weeks={weeks} /><span className="tiny faint">this week · {total12} in 12 weeks</span></> : null} />
      <Tile label="Database" value={stats ? formatBytes(stats.databaseSizeBytes) : '…'} />
    </div>
  );
}

const COLUMNS: { key: UserSortKey; label: string; right?: boolean; hideSm?: boolean }[] = [
  { key: 'username', label: 'User' },
  { key: 'role', label: 'Role', hideSm: true },
  { key: 'plan', label: 'Plan' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Joined', hideSm: true },
  { key: 'lastLoginAt', label: 'Last login', hideSm: true },
  { key: 'accountCount', label: 'Accounts', right: true, hideSm: true },
  { key: 'transactionCount', label: 'Entries', right: true, hideSm: true },
];

function Users() {
  const { token, user: me } = useStore();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: UserSortKey; dir: SortDir }>({ key: 'createdAt', dir: 'desc' });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [u, s] = await Promise.all([api.adminUsers(token), api.adminStats(token)]);
      setUsers(u);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(errorText(e, 'Could not load the users'));
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => sortUsers(filterUsers(users ?? [], query), sort.key, sort.dir), [users, query, sort]);
  const open = users?.find((u) => u.id === openId) ?? null;

  const sortBy = (key: UserSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir(key) }));

  /** Swap in a changed row without reloading the whole table; stats follow in the background. */
  const replace = (row: AdminUser) => {
    setUsers((list) => list?.map((u) => (u.id === row.id ? row : u)) ?? list);
    if (token) api.adminStats(token).then(setStats, () => undefined);
  };
  const removed = (id: string) => {
    setOpenId(null);
    setUsers((list) => list?.filter((u) => u.id !== id) ?? list);
    if (token) api.adminStats(token).then(setStats, () => undefined);
  };

  return (
    <div className="grid">
      <Section span="span-12">
        <StatsTiles stats={stats} />
      </Section>
      <Section
        span="span-12"
        title={users ? `Users · ${shown.length === users.length ? users.length : `${shown.length} of ${users.length}`}` : 'Users'}
        action={<input className="input admin-search" type="search" placeholder="Search name, email, status…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search users" />}
      >
        <ErrorLine>{error}</ErrorLine>
        {users === null && !error ? <div className="spinner" /> : null}
        {users && shown.length === 0 ? <Empty>{query ? 'No user matches.' : 'No users yet.'}</Empty> : null}
        {shown.length ? (
          <div className="scroll-x">
            <table className="table admin-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`${c.right ? 'right' : ''} ${c.hideSm ? 'hide-sm' : ''}`} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                      <button type="button" className="th-sort" onClick={() => sortBy(c.key)}>
                        {c.label}
                        <span aria-hidden className="faint">{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id} className="click" onClick={() => setOpenId(u.id)}>
                    <td>
                      <div className="truncate">{u.username}{u.id === me?.id ? <span className="faint"> · you</span> : null}</div>
                      <div className="tiny faint truncate">{u.email}</div>
                    </td>
                    <td className="hide-sm">{u.role === 'USER' ? <span className="muted">User</span> : <Tag>{u.role === 'ADMIN' ? 'Admin' : 'Debug'}</Tag>}</td>
                    <td>{u.plan === 'PREMIUM' ? <Tag tone="pos">Premium</Tag> : <span className="muted">Free</span>}</td>
                    <td>{u.status === 'locked' ? <Tag tone="neg">Locked</Tag> : <span className="muted">Active</span>}</td>
                    <td className="hide-sm small">{when(u.createdAt)}</td>
                    <td className="hide-sm small">{when(u.lastLoginAt)}</td>
                    <td className="right num hide-sm">{u.accountCount}</td>
                    <td className="right num hide-sm">{u.transactionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>
      {open ? <UserModal user={open} self={open.id === me?.id} onClose={() => setOpenId(null)} onChanged={replace} onDeleted={removed} /> : null}
    </div>
  );
}

function UserModal({
  user,
  self,
  onClose,
  onChanged,
  onDeleted,
}: {
  user: AdminUser;
  self: boolean;
  onClose: () => void;
  onChanged: (row: AdminUser) => void;
  onDeleted: (id: string) => void;
}) {
  const { token, refresh } = useStore();
  const copy = useCopy();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState<PasswordResetToken | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  const run = async (what: string, job: () => Promise<void>) => {
    if (!token) return;
    setBusy(what);
    setError(null);
    try { await job(); } catch (e) { setError(errorText(e, 'That did not work')); } finally { setBusy(null); }
  };

  const setPremium = (on: boolean) =>
    run('plan', async () => {
      const r = await api.adminSetPlan(token!, user.id, on ? 'PREMIUM' : 'FREE');
      onChanged({ ...user, plan: r.plan });
      // Your own plan shows elsewhere in the app too.
      if (self) refresh(['profile']);
    });
  const lock = () =>
    run('lock', async () => {
      if (user.status === 'locked') onChanged(await api.adminUnlock(token!, user.id));
      else if (window.confirm(`Lock ${user.username}? Every session and Shortcut token of this user ends now.`)) onChanged(await api.adminLock(token!, user.id));
    });
  const issueReset = () =>
    run('reset', async () => {
      if (reset && !window.confirm('Issue another reset link? The one shown stops working.')) return;
      setReset(await api.adminPasswordReset(token!, user.id));
    });
  const remove = () =>
    run('delete', async () => {
      await api.adminDeleteUser(token!, user.id);
      onDeleted(user.id);
    });

  const close = () => { if (!busy) onClose(); };

  if (confirmDelete) {
    const matches = typed === user.username;
    return (
      <Modal title="Delete user" onClose={() => { if (!busy) { setConfirmDelete(false); setTyped(''); } }} footer={<>
        <button className="btn danger" onClick={remove} disabled={!matches || busy !== null}>{busy === 'delete' ? 'Deleting…' : 'Delete user and data'}</button>
        <button className="btn ghost" onClick={() => { setConfirmDelete(false); setTyped(''); }} disabled={busy !== null}>Cancel</button>
      </>}>
        <p className="small muted">This removes <strong>{user.username}</strong> ({user.email}) and all their data on this instance, and ends their sessions. It cannot be undone. Audit rows stay.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (matches) remove(); }} style={{ marginTop: 12 }}>
          <Field label={`Type ${user.username} to confirm`}>
            <input className="input mono" type="text" autoComplete="off" spellCheck={false} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        </form>
        <ErrorLine>{error}</ErrorLine>
      </Modal>
    );
  }

  const link = reset ? resetLink(window.location.origin, reset.token) : '';

  return (
    <Modal title={user.username} onClose={close}>
      <div className="muted small">{user.email}</div>
      <ul className="plan-list small" style={{ marginTop: 14 }}>
        <li><span className="muted">Role</span><span>{user.role.toLowerCase()}</span></li>
        <li><span className="muted">Joined</span><span>{whenLong(user.createdAt)}</span></li>
        <li><span className="muted">Last login</span><span>{whenLong(user.lastLoginAt)}</span></li>
        {user.lockedAt ? <li><span className="muted">Locked since</span><span>{whenLong(user.lockedAt)}</span></li> : null}
        <li><span className="muted">Signed up with invite</span><span className="mono">{user.inviteCodeHint ? `…${user.inviteCodeHint}` : '—'}</span></li>
        <li><span className="muted">Accounts · entries</span><span className="num">{user.accountCount} · {user.transactionCount}</span></li>
      </ul>

      <div className="stack" style={{ gap: 14, marginTop: 18 }}>
        <Switch checked={user.plan === 'PREMIUM'} onChange={(on) => { if (busy === null) setPremium(on); }} label={busy === 'plan' ? 'Saving…' : 'Premium'} />

        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn" onClick={lock} disabled={busy !== null || (self && user.status !== 'locked')} title={self ? 'You cannot lock your own account' : undefined}>
            {busy === 'lock' ? '…' : user.status === 'locked' ? 'Unlock' : 'Lock'}
          </button>
          <button className="btn" onClick={issueReset} disabled={busy !== null}>{busy === 'reset' ? 'Creating…' : reset ? 'New reset link' : 'Password reset link'}</button>
          <span className="grow" />
          <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={busy !== null || self} title={self ? 'Delete your own account from Settings' : undefined}>Delete…</button>
        </div>

        {reset ? (
          <div className="diag" style={{ marginTop: 0 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="small">Reset link, valid until {dateTime(reset.expiresAt)}</span>
              <button className="btn sm" onClick={() => copy(link, 'Link')}>Copy link</button>
            </div>
            <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="row-between" style={{ margin: '10px 0 6px' }}>
              <span className="small">Token</span>
              <button className="btn sm" onClick={() => copy(reset.token, 'Token')}>Copy token</button>
            </div>
            <input className="input mono" readOnly value={reset.token} onFocus={(e) => e.target.select()} />
            <p className="tiny faint" style={{ marginTop: 6 }}>Shown once. It works one time; using it signs {user.username} out everywhere.{user.status === 'locked' ? ' A locked user still cannot sign in afterwards.' : ''}</p>
          </div>
        ) : null}
        <ErrorLine>{error}</ErrorLine>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- invites

const STATUS_TONE: Record<Invite['status'], '' | 'pos' | 'neg'> = { active: 'pos', used: '', revoked: 'neg', expired: '' };

function Invites() {
  const { token } = useStore();
  const copy = useCopy();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try { setInvites(await api.invites(token)); setError(null); } catch (e) { setError(errorText(e, 'Could not load the invites')); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.config().then((c) => setMode(c.registrationMode), () => undefined); }, []);

  const daysNum = days.trim() === '' ? null : Number(days);
  const daysOk = daysNum === null || (Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 365);

  const create = async () => {
    if (!token || !daysOk) return;
    setBusy(true); setError(null);
    try {
      const inv = await api.createInvite(token, { expiresInDays: daysNum, note: note.trim() || null });
      setCreated(inv);
      setNote('');
      setDays('');
      await load();
    } catch (e) { setError(errorText(e, 'Could not create the invite')); } finally { setBusy(false); }
  };

  const revoke = async (inv: Invite) => {
    if (!token || !window.confirm(`Revoke invite …${inv.codeHint}? It stops working at once.`)) return;
    try {
      const r = await api.revokeInvite(token, inv.id);
      setInvites((list) => list?.map((i) => (i.id === r.id ? r : i)) ?? list);
      if (created?.id === inv.id) setCreated(null);
    } catch (e) { setError(errorText(e, 'Could not revoke the invite')); }
  };

  const link = created?.code ? inviteLink(window.location.origin, created.code) : '';

  return (
    <div className="grid">
      <Section span="span-5" title="New invite">
        {mode && mode !== 'invite' ? (
          <p className="small muted" style={{ marginBottom: 12 }}>
            Signup on this instance is <strong>{mode}</strong>{mode === 'closed' ? ', so invite codes are not accepted' : ', so nobody needs a code'}. Set <span className="mono">SUMRY_REGISTRATION_MODE=invite</span> for invites to matter.
          </p>
        ) : null}
        <div className="stack" style={{ gap: 10 }}>
          <Field label="Expires after (days, empty = never)">
            <input className="input num" type="number" min={1} max={365} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="never" />
          </Field>
          <Field label="Note for yourself (optional)">
            <input className="input" type="text" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. who it is for" />
          </Field>
          {!daysOk ? <div className="small neg">Between 1 and 365 days.</div> : null}
          <div><button className="btn primary" onClick={create} disabled={busy || !daysOk}>{busy ? 'Creating…' : 'Create invite'}</button></div>
        </div>
        {created?.code ? (
          <div className="diag">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="small">{created.expiresAt ? `Valid until ${dateTime(created.expiresAt)}` : 'Never expires'} · works once</span>
              <button className="btn sm" onClick={() => copy(link, 'Link')}>Copy link</button>
            </div>
            <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="row-between" style={{ margin: '10px 0 6px' }}>
              <span className="small">Code</span>
              <button className="btn sm" onClick={() => copy(created.code!, 'Code')}>Copy code</button>
            </div>
            <input className="input mono" readOnly value={created.code} onFocus={(e) => e.target.select()} />
            <p className="tiny faint" style={{ marginTop: 6 }}>Shown once. Only a hash is stored, so the code cannot be read again.</p>
          </div>
        ) : null}
        <ErrorLine>{error}</ErrorLine>
      </Section>
      <Section span="span-7" title={invites ? `Invites · ${invites.length}` : 'Invites'}>
        {invites === null && !error ? <div className="spinner" /> : null}
        {invites && invites.length === 0 ? <Empty>No invites yet.</Empty> : null}
        {invites && invites.length ? (
          <div className="scroll-x">
            <table className="table admin-table">
              <thead>
                <tr><th>Code</th><th>Status</th><th className="hide-sm">Note</th><th>Created</th><th>Expires</th><th className="right" /></tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td className="mono">…{i.codeHint}</td>
                    <td><Tag tone={STATUS_TONE[i.status]}>{i.status}</Tag>{i.usedAt ? <div className="tiny faint">{when(i.usedAt)}</div> : null}</td>
                    <td className="hide-sm small muted"><div className="truncate" style={{ maxWidth: 200 }}>{i.note ?? ''}</div></td>
                    <td className="small">{when(i.createdAt)}</td>
                    <td className="small">{i.expiresAt ? when(i.expiresAt) : <span className="faint">never</span>}</td>
                    <td className="right">{i.status === 'active' ? <button className="btn sm ghost" onClick={() => revoke(i)}>Revoke</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------- audit

const AUDIT_SIZE = 50;

function Audit() {
  const { token } = useStore();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    api.adminAudit(token, page, AUDIT_SIZE)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(errorText(e, 'Could not load the audit log')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page]);

  const pages = Math.max(1, data?.totalPages ?? 1);
  const pager = (
    <div className="row" style={{ gap: 6 }}>
      {loading ? <span className="spinner" /> : null}
      <button className="btn sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>Newer</button>
      <span className="small muted num">{page + 1} / {pages}</span>
      <button className="btn sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages || loading}>Older</button>
    </div>
  );

  return (
    <div className="grid">
      <Section span="span-12" title={data ? `Audit log · ${data.totalItems}` : 'Audit log'} action={pager}>
        <ErrorLine>{error}</ErrorLine>
        {data === null && !error ? <div className="spinner" /> : null}
        {data && data.items.length === 0 ? <Empty>Nothing yet. Plan changes, locks, deletions, resets and invites show up here.</Empty> : null}
        {data && data.items.length ? (
          <div className="scroll-x">
            <table className="table admin-table">
              <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>User</th><th className="hide-sm">Detail</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="small nowrap">{dateTime(a.createdAt)}</td>
                    <td>{a.adminUsername ?? <span className="faint mono" title={a.adminId}>deleted</span>}</td>
                    <td>{auditActionLabel(a.action)}</td>
                    <td>{a.targetUsername ?? (a.targetUserId ? <span className="faint mono" title={a.targetUserId}>deleted · {a.targetUserId.slice(0, 8)}</span> : <span className="faint">—</span>)}</td>
                    <td className="hide-sm small muted">{auditDetail(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
