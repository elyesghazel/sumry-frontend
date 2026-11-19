import { useEffect, useMemo, useState } from 'react';
import {
  type Account,
  type Category,
  type MatchType,
  type Rule,
  type RuleApplyResult,
  type ShortcutToken,
  PREMIUM_PRICES,
  blockedBy,
  formatAmount,
  formatLongDate,
  formatShortDate,
  isAdmin,
  isoDay,
} from '../../core';
import { api } from '../api';
import { categoryColor, href, navigate, useStore, type Route } from '../store';
import { Empty, ErrorLine, Field, Modal, Section, Segmented, Swatch, Switch, Tag } from '../ui';
import { PageHead } from '../components/Nav';
import { AccountEditor, CategoryEditor, CategorySelect } from '../components/Editor';
import { PlanNotice } from '../components/PlanNotice';
import { LegalLinks } from '../legal';

type Tab = 'accounts' | 'categories' | 'data' | 'shortcuts' | 'look' | 'security' | 'plan';
const TABS: { key: Tab; label: string }[] = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'categories', label: 'Categories & rules' },
  { key: 'data', label: 'Import & export' },
  { key: 'shortcuts', label: 'Shortcuts' },
  { key: 'look', label: 'Look & privacy' },
  { key: 'security', label: 'Sign-in' },
  { key: 'plan', label: 'Plan' },
];
const LEGACY_TAB: Record<string, Tab> = { rules: 'categories', import: 'data', export: 'data', account: 'security', statement: 'data' };

export function Settings({ route }: { route: Route }) {
  const { profile } = useStore();
  const raw = route.params.get('tab') ?? 'accounts';
  if (raw === 'statement') { navigate('insights', { tab: 'statement' }); return null; }
  // The plan tab exists only where plans are enforced; self-hosters never see it.
  const tabs = profile?.limitsEnabled ? TABS : TABS.filter((t) => t.key !== 'plan');
  const tab: Tab = (tabs.some((t) => t.key === raw) ? raw : LEGACY_TAB[raw] ?? 'accounts') as Tab;
  return (
    <>
      <PageHead title="Settings" sub="Set it up once." />
      <div className="tabs-row"><Segmented options={tabs} value={tab} onChange={(t) => navigate('settings', { tab: t })} /></div>
      {tab === 'accounts' ? <Accounts /> : null}
      {tab === 'categories' ? <CategoriesAndRules /> : null}
      {tab === 'data' ? <Data /> : null}
      {tab === 'shortcuts' ? <Shortcuts /> : null}
      {tab === 'look' ? <Look /> : null}
      {tab === 'security' ? <AccountSettings /> : null}
      {tab === 'plan' ? <PlanSettings /> : null}
      <LegalLinks />
    </>
  );
}

// ---------------------------------------------------------------- accounts

function Accounts() {
  const { accounts, profile } = useStore();
  const [editing, setEditing] = useState<Account | null | undefined>(undefined);
  const full = blockedBy(profile, 'accounts', accounts.length);
  const max = profile?.limitsEnabled ? profile.limits.maxAccounts : null;
  return (
    <Section span="" title={max != null ? `${accounts.length} of ${max} accounts` : `${accounts.length} accounts`} action={<button className="btn sm" onClick={() => setEditing(null)} disabled={full}>+ Account</button>}>
      <div className="list">
        {accounts.map((a) => (
          <div key={a.id} className="row-between wrap">
            <a className="dot-row grow" href={href('account', { id: a.id })} style={{ minWidth: 0 }}>
              <span className="truncate"><strong>{a.accountName}</strong></span>
              {a.currency !== 'CHF' ? <Tag>{a.currency}</Tag> : null}
              {a.spending === false ? <Tag>savings</Tag> : <Tag tone="fill">spending</Tag>}
              <span className="tiny faint hide-sm">{a.lastReconciledAt ? `checked ${formatShortDate(a.lastReconciledAt)}` : a.lastReconciledAt === null ? 'never checked' : ''}</span>
            </a>
            <span className="row" style={{ gap: 6 }}>
              <span className="num money">{formatAmount(a.currentBalance)}</span>
              <a className="btn sm ghost" href={href('account', { id: a.id, reconcile: '1' })}>Reconcile</a>
              <button className="btn sm ghost" onClick={() => setEditing(a)}>Edit</button>
            </span>
          </div>
        ))}
      </div>
      {full ? <PlanNotice limit="accounts" /> : null}
      <p className="tiny faint" style={{ marginTop: 10 }}>Savings accounts stay out of safe to spend. Open an account for its balance line, cash flow and the bank check.</p>
      {editing !== undefined ? <AccountEditor editing={editing} onClose={() => setEditing(undefined)} /> : null}
    </Section>
  );
}

// -------------------------------------------------------- categories + rules

function CategoriesAndRules() {
  const { categories, rules, transactions, accounts, token, refresh, toast } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [catEditor, setCatEditor] = useState<Category | null | undefined>(undefined);
  const [ruleEditor, setRuleEditor] = useState<{ rule: Rule | null; category?: string } | null>(null);
  const [test, setTest] = useState('');
  const [testResult, setTestResult] = useState<{ label: string | null; rule: Rule | null } | undefined>(undefined);
  const [apply, setApply] = useState<RuleApplyResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(['rules']); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token || !test.trim()) { setTestResult(undefined); return; }
    const id = window.setTimeout(async () => {
      try { const r = await api.testRule(token, test); setTestResult({ label: r.categoryLabel, rule: r.rule }); } catch { setTestResult(undefined); }
    }, 250);
    return () => window.clearTimeout(id);
  }, [test, token]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.categoryLabel) m.set(t.categoryLabel, (m.get(t.categoryLabel) ?? 0) + 1);
    return m;
  }, [transactions]);
  const rulesBy = useMemo(() => {
    const m = new Map<string, Rule[]>();
    for (const r of rules) m.set(r.categoryLabel, [...(m.get(r.categoryLabel) ?? []), r]);
    return m;
  }, [rules]);
  const groups = useMemo(() => {
    const g = new Map<string, Category[]>();
    for (const c of [...categories].sort((a, b) => a.label.localeCompare(b.label))) {
      const k = c.parentGroup ?? (c.categoryType === 'INCOME' ? 'Income' : 'Other');
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [categories]);
  const current = categories.find((c) => c.label === selected) ?? null;
  const currentRules = selected ? rulesBy.get(selected) ?? [] : [];

  const run = async (dryRun: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await api.applyRules(token, dryRun);
      setApply(r);
      if (!dryRun) { toast(`Recategorised ${r.changed} entries`); await refresh(['core', 'rules', 'budgets', 'insights']); }
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
  };

  return (
    <div className="grid">
      <Section span="span-7" title={`${categories.length} categories · ${rules.length} rules`} action={<span className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setRuleEditor({ rule: null })}>+ Rule</button><button className="btn sm" onClick={() => setCatEditor(null)}>+ Category</button></span>}>
        <p className="small muted" style={{ marginBottom: 12 }}>Pick a category to see and edit the rules that file entries into it. A rule reads the note of a new entry (quick add, import, the phone, Apple Pay) and sets the category.</p>
        <div className="catgrid">
          {groups.map(([g, list]) => (
            <div key={g}>
              <div className="caption" style={{ marginBottom: 6 }}>{g}</div>
              <div className="list tight">
                {list.map((c) => {
                  const n = rulesBy.get(c.label)?.length ?? 0;
                  return (
                    <button key={c.id} className={`row-between catrow ${selected === c.label ? 'on' : ''}`} onClick={() => setSelected(selected === c.label ? null : c.label)}>
                      <span className="dot-row" style={{ minWidth: 0 }}><Swatch color={categoryColor(c.label, c.color)} /><span className="truncate">{c.label}</span>{c.categoryType === 'INCOME' ? <Tag tone="pos">in</Tag> : null}</span>
                      <span className="tiny faint" style={{ flex: '0 0 auto' }}>{n ? `${n} rule${n > 1 ? 's' : ''} · ` : ''}{usage.get(c.label) ?? 0}×</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="span-5 stack">
        {current ? (
          <section className="panel fade-in">
            <header className="panel-head">
              <h2 className="dot-row"><Swatch color={categoryColor(current.label, current.color)} />{current.label}</h2>
              <span className="row" style={{ gap: 6 }}>
                <a className="btn sm ghost" href={href('activity', { category: current.label })}>Entries</a>
                <button className="btn sm ghost" onClick={() => setCatEditor(current)}>Edit</button>
              </span>
            </header>
            <div className="small muted" style={{ marginBottom: 8 }}>{current.categoryType === 'INCOME' ? 'Income' : 'Spending'}{current.parentGroup ? ` · ${current.parentGroup}` : ''} · {usage.get(current.label) ?? 0} entries</div>
            <div className="caption" style={{ marginBottom: 4 }}>Rules</div>
            {currentRules.length ? (
              <div className="list tight">
                {currentRules.map((r) => (
                  <button key={r.id} className="row-between catrow" onClick={() => setRuleEditor({ rule: r })} style={{ opacity: r.isActive ? 1 : 0.5 }}>
                    <span className="truncate"><span className="faint small">{r.matchType.toLowerCase().replace('_', ' ')}</span> <span className="mono">{r.pattern}</span>{r.accountName ? <span className="tiny faint"> · {r.accountName}</span> : null}</span>
                    <span className="tiny faint">{r.hits} hits · #{r.priority}</span>
                  </button>
                ))}
              </div>
            ) : <Empty>No rules file entries here yet.</Empty>}
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setRuleEditor({ rule: null, category: current.label })}>+ Rule for {current.label}</button>
          </section>
        ) : null}

        <section className="panel">
          <header className="panel-head"><h2>Try a note</h2></header>
          <input className="input" placeholder="Kebab Haus Zürich" value={test} onChange={(e) => setTest(e.target.value)} />
          <div className="small" style={{ marginTop: 8, minHeight: 20 }}>
            {testResult === undefined ? <span className="faint">Type a note to see which rule fires.</span> : testResult.label ? (
              <span>→ <button className="link" onClick={() => setSelected(testResult.label)}><strong>{testResult.label}</strong></button>{testResult.rule ? <span className="faint"> via <span className="mono">{testResult.rule.pattern}</span></span> : null}</span>
            ) : <span className="faint">No rule matches. <button className="link" onClick={() => setRuleEditor({ rule: null })}>Add one</button></span>}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Apply to history</h2></header>
          <p className="small muted">Re-run every rule over past entries. Only the category changes. Preview first.</p>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={() => run(true)} disabled={busy || !rules.length}>Preview</button>
            <button className="btn sm primary" onClick={() => { if (window.confirm(`Recategorise ${apply?.changed ?? 'the matching'} entries?`)) run(false); }} disabled={busy || !apply || apply.changed === 0}>Apply {apply?.dryRun && apply.changed ? `(${apply.changed})` : ''}</button>
          </div>
          {apply ? (
            <div className="small" style={{ marginTop: 12 }}>
              <div className="muted">{apply.examined} examined · {apply.changed} would change · {apply.skippedKindMismatch} skipped</div>
              <div className="list tight" style={{ marginTop: 6, maxHeight: 240, overflowY: 'auto' }}>
                {apply.changes.slice(0, 50).map((c) => (
                  <div className="row-between" key={c.transactionId}>
                    <span className="truncate">{c.date ? formatShortDate(c.date) : ''} · {c.description}</span>
                    <span className="tiny faint" style={{ flex: '0 0 auto' }}>{c.fromCategory ?? '—'} → <strong className="muted">{c.toCategory}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {catEditor !== undefined ? <CategoryEditor editing={catEditor} onClose={() => setCatEditor(undefined)} /> : null}
      {ruleEditor ? <RuleEditor editing={ruleEditor.rule} presetCategory={ruleEditor.category} onClose={() => setRuleEditor(null)} categories={categories} accounts={accounts} /> : null}
    </div>
  );
}

function RuleEditor({ editing, onClose, categories, accounts, presetCategory }: { presetCategory?: string; editing: Rule | null; onClose: () => void; categories: Category[]; accounts: { id: string; accountName: string; currency: string }[] }) {
  const { token, refresh, toast } = useStore();
  const [pattern, setPattern] = useState(editing?.pattern ?? '');
  const [matchType, setMatchType] = useState<MatchType>(editing?.matchType ?? 'CONTAINS');
  const [category, setCategory] = useState(editing?.categoryLabel ?? presetCategory ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [priority, setPriority] = useState(String(editing?.priority ?? 100));
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = pattern.trim() && category;

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      const p = Number.parseInt(priority) || 100;
      if (editing) await api.updateRule(token, editing.id, { pattern: pattern.trim(), matchType, categoryLabel: category, accountId: accountId || undefined, clearAccount: !accountId, priority: p, isActive: active });
      else await api.createRule(token, { pattern: pattern.trim(), matchType, categoryLabel: category, accountId: accountId || null, priority: p });
      toast('Saved'); await refresh(['rules']); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !editing || !window.confirm('Delete this rule?')) return;
    setBusy(true);
    try { await api.deleteRule(token, editing.id); toast('Deleted'); await refresh(['rules']); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit rule' : 'New rule'} onClose={onClose} footer={<>
      {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Delete</button> : null}
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="field-row">
        <Field label="When the note" style={{ flex: '0 0 140px' }}>
          <select className="input" value={matchType} onChange={(e) => setMatchType(e.target.value as MatchType)}>
            <option value="CONTAINS">contains</option><option value="STARTS_WITH">starts with</option><option value="EQUALS">equals</option><option value="REGEX">matches regex</option>
          </select>
        </Field>
        <Field label="Pattern" grow><input className="input lg mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="coop" autoFocus /></Field>
      </div>
      <Field label="Set category"><CategorySelect categories={categories} value={category} onChange={setCategory} allowEmpty="Choose…" /></Field>
      <div className="field-row">
        <Field label="Only on account" grow>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Any account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
        </Field>
        <Field label="Priority (lower first)" style={{ flex: '0 0 140px' }}><input className="input num" inputMode="numeric" value={priority} onChange={(e) => setPriority(e.target.value)} /></Field>
      </div>
      {editing ? <Switch checked={active} onChange={setActive} label="Active" /> : null}
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

// -------------------------------------------------------------------- data

function Data() {
  const { profile } = useStore();
  const blocked = blockedBy(profile, 'statement_import');
  return (
    <div className="grid">
      <Section span="span-6" title="Import a statement">
        <p className="small muted" style={{ marginBottom: 12 }}>PostFinance PDF statements, camt.053 XML from any Swiss bank, and CSV exports (PostFinance, Revolut, generic). You check every row before anything is booked.</p>
        {blocked ? <PlanNotice limit="statement_import" /> : <a className="btn primary" href={href('import')}>Import statement</a>}
      </Section>
      <Export />
    </div>
  );
}

function Export() {
  const { accounts, token } = useStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: 'csv' | 'json') => {
    if (!token) return;
    setBusy(true); setError(null);
    try {
      const p = { from: from || undefined, to: to || undefined, accountId: accountId || undefined };
      const body = kind === 'csv' ? await api.exportCsv(token, p) : JSON.stringify(await api.exportJson(token, p), null, 2);
      const blob = new Blob([kind === 'csv' ? `﻿${body}` : body], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sumry-${isoDay(new Date())}.${kind}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed'); } finally { setBusy(false); }
  };

  return (
    <>
      <Section span="span-6" title="Export entries">
        <p className="small muted" style={{ marginBottom: 12 }}>Every column, including the base-currency value and the balance after each entry. CSV opens in Excel and Numbers; JSON is the API shape.</p>
        <div className="field-row">
          <Field label="From"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Field label="Account" style={{ marginTop: 10 }}>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
        </Field>
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={() => download('csv')} disabled={busy}>Download CSV</button>
          <button className="btn" onClick={() => download('json')} disabled={busy}>Download JSON</button>
        </div>
        <ErrorLine>{error}</ErrorLine>
      </Section>
    </>
  );
}

// --------------------------------------------------------------- shortcuts

function Shortcuts() {
  const { token, toast } = useStore();
  const [minted, setMinted] = useState<ShortcutToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mint = async () => {
    if (!token || (minted && !window.confirm('Create another token? The old one keeps working until it expires.'))) return;
    setBusy(true); setError(null);
    try { setMinted(await api.shortcutToken(token)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not create a token'); } finally { setBusy(false); }
  };
  const copy = async () => {
    if (!minted) return;
    try { await navigator.clipboard.writeText(minted.token); toast('Token copied'); } catch { toast('Select the token and copy it'); }
  };
  return (
    <div className="grid">
      <Section span="span-6" title="Apple Pay shortcut">
        <p className="small muted">An Apple Shortcut automation can log every Apple Pay payment. It needs a token that only reaches the shortcut endpoints and lives one year.</p>
        <ol className="small muted steps">
          <li>Create a token here and copy it.</li>
          <li>In the Shortcuts app, paste it into the Sumry shortcut's token field.</li>
          <li>Add a Wallet automation (“When I tap any card”) that runs the shortcut.</li>
        </ol>
        <button className="btn primary" onClick={mint} disabled={busy}>{busy ? 'Creating…' : minted ? 'Create another' : 'Create token'}</button>
        {minted ? (
          <div className="diag" style={{ marginTop: 12 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="small">Valid until {formatLongDate(minted.expiresAt)}</span>
              <button className="btn sm" onClick={copy}>Copy</button>
            </div>
            <textarea className="input mono" readOnly value={minted.token} rows={3} onFocus={(e) => e.target.select()} style={{ minHeight: 70 }} />
            <p className="tiny faint" style={{ marginTop: 6 }}>Shown once. Treat it like a password; signing out everywhere does not revoke it before it expires.</p>
          </div>
        ) : null}
        <ErrorLine>{error}</ErrorLine>
      </Section>
      <Section span="span-6" title="Keyboard">
        <div className="list tight small">
          <div className="row-between"><span>Search, add, jump</span><span><span className="kbd">⌘K</span> or <span className="kbd">/</span></span></div>
          <div className="row-between"><span>Today · Activity · Plan · Insights</span><span><span className="kbd">G</span> then <span className="kbd">T</span> <span className="kbd">A</span> <span className="kbd">P</span> <span className="kbd">I</span></span></div>
          <div className="row-between"><span>Settings</span><span><span className="kbd">G</span> <span className="kbd">S</span></span></div>
          <div className="row-between"><span>Book the quick entry</span><span className="kbd">Enter</span></div>
          <div className="row-between"><span>Close</span><span className="kbd">Esc</span></div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>Try: <span className="mono">12.50 kebab cash yesterday</span> · <span className="mono">got 300 lohn</span> · <span className="mono">500 from pf to sparkonto</span> · <span className="mono">netflix 17.90 #Abos</span></p>
      </Section>
    </div>
  );
}

// -------------------------------------------------------------------- look

function Look() {
  const { theme, setTheme, density, setDensity, privacy, setPrivacy } = useStore();
  return (
    <div className="grid">
      <Section span="span-6" title="Appearance">
        <Field label="Theme"><Segmented options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} value={theme} onChange={setTheme} /></Field>
        <div style={{ height: 12 }} />
        <Field label="Density"><Segmented options={[{ key: 'comfortable', label: 'Comfortable' }, { key: 'compact', label: 'Compact' }]} value={density} onChange={setDensity} /></Field>
      </Section>
      <Section span="span-6" title="Privacy">
        <Switch checked={privacy} onChange={setPrivacy} label="Blur amounts (hover to reveal)" />
        <p className="tiny faint" style={{ marginTop: 8 }}>For screen sharing and the train. Stored on this device only. App lock and Face ID live in the phone app.</p>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ account

function AccountSettings() {
  const { user, token, signOut, adoptToken, toast, preferences, refresh, profile } = useStore();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { refresh(['prefs']); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = async () => {
    if (!token || nw.length < 12 || nw !== nw2) return;
    setBusy(true); setError(null);
    try {
      const r = await api.changePassword(token, cur, nw);
      // Every other session is now invalid; this one continues on the fresh token.
      adoptToken(r.token);
      setCur(''); setNw(''); setNw2('');
      toast('Password changed — other devices were signed out');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the password'); } finally { setBusy(false); }
  };

  return (
    <div className="grid">
      <Section span="span-6" title="Signed in">
        <div className="serif" style={{ fontSize: 22 }}>{user?.username}</div>
        <div className="muted small">{user?.email}{preferences ? ` · base currency ${preferences.preferredCurrency}` : ''}</div>
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={() => signOut(false)}>Sign out</button>
          <button className="btn ghost" onClick={() => { if (window.confirm('Sign out on every device, including the phone?')) signOut(true); }}>Sign out everywhere</button>
        </div>
        <p className="tiny faint" style={{ marginTop: 12 }}>Tokens live 30 days but can be revoked: signing out ends this one immediately; “everywhere” invalidates all of them.</p>
        {isAdmin(profile) ? <p className="small" style={{ marginTop: 12 }}><a className="link" href={href('admin')}>Admin: users, invites, audit log</a></p> : null}
      </Section>
      <Section span="span-6" title="Change password">
        <div className="stack" style={{ gap: 10 }}>
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password (12+ characters)"><input className="input" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
          <Field label="Repeat"><input className="input" type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} /></Field>
          <div><button className="btn primary" onClick={change} disabled={busy || !cur || nw.length < 12 || nw !== nw2}>{busy ? 'Changing…' : 'Change password'}</button></div>
          <ErrorLine>{error}</ErrorLine>
        </div>
      </Section>
      <DeleteAccount />
    </div>
  );
}

// -------------------------------------------------------------------- plan

function PlanSettings() {
  const { profile, accounts, refresh } = useStore();
  // An admin can switch the plan at any time; reload it when the tab opens.
  useEffect(() => { refresh(['profile']); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!profile?.limitsEnabled) return null;
  const premium = profile.plan === 'PREMIUM';
  const { limits } = profile;
  const yes = (on: boolean) => (on ? <span>included</span> : <span className="faint">Premium</span>);
  return (
    <div className="grid">
      <Section span="span-6" title="Your plan">
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <div className="serif" style={{ fontSize: 22 }}>{premium ? 'Premium' : 'Free'}</div>
          {premium ? <Tag tone="pos">everything unlocked</Tag> : null}
        </div>
        <ul className="plan-list small" style={{ marginTop: 14 }}>
          <li><span className="muted">Accounts</span><span className="num">{limits.maxAccounts == null ? 'unlimited' : `${accounts.length} of ${limits.maxAccounts}`}</span></li>
          <li><span className="muted">Statement import</span>{yes(limits.statementImport)}</li>
          <li><span className="muted">Statement by email</span>{yes(limits.statementEmail)}</li>
          <li><span className="muted">Entries, budgets, plans, goals, insights</span><span>included</span></li>
        </ul>
      </Section>
      {premium ? null : (
        <Section span="span-6" title="Premium">
          <div className="plan-offer">
            <ul className="plan-prices">
              {PREMIUM_PRICES.map((p) => (
                <li key={p.label}>
                  <span className="muted">{p.label}</span> <span className="serif">{p.price}</span>
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ marginTop: 6 }}>Unlimited accounts, statement import (PDF, camt.053, CSV) and the monthly statement by email.</p>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Payment is by TWINT or PayPal for now, not in the app. No subscription. Contact whoever runs this Sumry instance; they switch your account over once it's paid.</p>
        </Section>
      )}
    </div>
  );
}

function DeleteAccount() {
  const { user, token, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { if (!busy) { setOpen(false); setPassword(''); setError(null); } };

  const remove = async () => {
    if (!token || !password) return;
    setBusy(true); setError(null);
    try {
      await api.deleteMe(token, password);
      // The token died with the account; signing out only clears this device.
      await signOut(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account');
      setBusy(false);
    }
  };

  return (
    <Section span="span-6" title="Delete account">
      <p className="small muted">Removes your account and everything in it: accounts, entries, budgets, plans, goals and rules. This cannot be undone.</p>
      <p className="small muted" style={{ marginTop: 8 }}>Want a copy first? Download it under <a className="link" href={href('settings', { tab: 'data' })}>Import &amp; export</a>.</p>
      <div style={{ marginTop: 14 }}><button className="btn danger" onClick={() => setOpen(true)}>Delete account…</button></div>
      {open ? (
        <Modal title="Delete account" onClose={close} footer={<>
          <button className="btn danger" onClick={remove} disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete everything'}</button>
          <button className="btn ghost" onClick={close} disabled={busy}>Cancel</button>
        </>}>
          <p className="small muted">This deletes <strong>{user?.email}</strong> and all its data on this instance, and signs out every device. Enter your password to confirm.</p>
          <form onSubmit={(e) => { e.preventDefault(); remove(); }}>
            <Field label="Password"><input className="input" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </form>
          <ErrorLine>{error}</ErrorLine>
        </Modal>
      ) : null}
    </Section>
  );
}
