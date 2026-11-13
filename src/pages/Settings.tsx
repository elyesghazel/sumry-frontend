import { useEffect, useMemo, useState } from 'react';
import {
  type Category,
  type ImportPreview,
  type MatchType,
  type Rule,
  type RuleApplyResult,
  type Statement,
  formatAmount,
  formatShortDate,
  isoDay,
} from '../../core';
import { api } from '../api';
import { categoryColor, useStore, type Route } from '../store';
import { Empty, ErrorLine, Field, Modal, Section, Swatch, Switch, Tag } from '../ui';
import { AccountSelect, CategoryEditor, CategorySelect } from '../components/Editor';

type Tab = 'rules' | 'import' | 'export' | 'statement' | 'categories' | 'account';
const TABS: { key: Tab; label: string }[] = [
  { key: 'rules', label: 'Rules' },
  { key: 'import', label: 'Import' },
  { key: 'export', label: 'Export' },
  { key: 'statement', label: 'Statement' },
  { key: 'categories', label: 'Categories' },
  { key: 'account', label: 'Account' },
];

export function Settings({ route }: { route: Route }) {
  const initial = (route.params.get('tab') as Tab | null) ?? 'rules';
  const [tab, setTab] = useState<Tab>(initial);
  useEffect(() => setTab((route.params.get('tab') as Tab | null) ?? 'rules'), [route]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Rules, imports, exports and the monthly statement.</p>
        </div>
        <div className="seg">{TABS.map((t) => <button key={t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
      </div>
      {tab === 'rules' ? <Rules /> : null}
      {tab === 'import' ? <Import /> : null}
      {tab === 'export' ? <Export /> : null}
      {tab === 'statement' ? <StatementView /> : null}
      {tab === 'categories' ? <Categories /> : null}
      {tab === 'account' ? <AccountSettings /> : null}
    </>
  );
}

// ------------------------------------------------------------------- rules

function Rules() {
  const { rules, categories, accounts, token, refresh, toast } = useStore();
  const [editing, setEditing] = useState<Rule | null | undefined>(undefined);
  const [test, setTest] = useState('');
  const [testResult, setTestResult] = useState<string | null | undefined>(undefined);
  const [apply, setApply] = useState<RuleApplyResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(['rules']); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token || !test.trim()) { setTestResult(undefined); return; }
    const id = window.setTimeout(async () => setTestResult((await api.testRule(token, test)).categoryLabel), 250);
    return () => window.clearTimeout(id);
  }, [test, token]);

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
      <Section span="span-7" title="Rules" action={<button className="btn sm" onClick={() => setEditing(null)}>+ Rule</button>}>
        <p className="small muted" style={{ marginBottom: 12 }}>A rule reads the note of a new entry and picks the category — for quick entries, imports, and the mobile app when it sends none. Lower priority runs first.</p>
        {rules.length ? (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Pattern</th><th>Match</th><th>Category</th><th className="hide-sm">Account</th><th className="right">Hits</th><th></th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="click" onClick={() => setEditing(r)} style={{ opacity: r.isActive ? 1 : 0.5 }}>
                  <td className="mono">{r.pattern}</td>
                  <td className="faint small">{r.matchType.toLowerCase().replace('_', ' ')}</td>
                  <td><span className="dot-row"><Swatch color={categoryColor(r.categoryLabel, r.categoryColor)} />{r.categoryLabel}</span></td>
                  <td className="faint small hide-sm">{r.accountName ?? 'any'}</td>
                  <td className="right num faint">{r.hits}</td>
                  <td className="right tiny faint">#{r.priority}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <Empty>No rules yet. Try “coop → Lebensmittel”.</Empty>}
      </Section>

      <Section span="span-5" title="Try a note">
        <input className="input" placeholder="Kebab Haus Zürich" value={test} onChange={(e) => setTest(e.target.value)} />
        <div className="small" style={{ marginTop: 8, minHeight: 20 }}>
          {testResult === undefined ? <span className="faint">Type a note to see which rule fires.</span> : testResult ? <span>→ <strong>{testResult}</strong></span> : <span className="faint">No rule matches.</span>}
        </div>
        <div style={{ borderTop: '1px solid var(--rule)', marginTop: 18, paddingTop: 14 }}>
          <h3 style={{ marginBottom: 6 }}>Apply to history</h3>
          <p className="small muted">Re-run every rule over past entries. Only the category changes; amounts and balances stay. Preview first.</p>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm" onClick={() => run(true)} disabled={busy || !rules.length}>Preview</button>
            <button className="btn sm primary" onClick={() => { if (window.confirm(`Recategorise ${apply?.changed ?? 'the matching'} entries?`)) run(false); }} disabled={busy || !apply || apply.changed === 0}>Apply {apply?.dryRun && apply.changed ? `(${apply.changed})` : ''}</button>
          </div>
          {apply ? (
            <div className="small" style={{ marginTop: 12 }}>
              <div className="muted">{apply.examined} examined · {apply.changed} would change · {apply.skippedKindMismatch} skipped (income/expense mismatch)</div>
              <div className="list tight" style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
                {apply.changes.slice(0, 50).map((c) => (
                  <div className="row-between" key={c.transactionId}>
                    <span className="truncate">{c.date ? formatShortDate(c.date) : ''} · {c.description}</span>
                    <span className="tiny faint" style={{ flex: '0 0 auto' }}>{c.fromCategory ?? '—'} → <strong className="muted">{c.toCategory}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Section>
      {editing !== undefined ? <RuleEditor editing={editing} onClose={() => setEditing(undefined)} categories={categories} accounts={accounts} /> : null}
    </div>
  );
}

function RuleEditor({ editing, onClose, categories, accounts }: { editing: Rule | null; onClose: () => void; categories: Category[]; accounts: { id: string; accountName: string; currency: string }[] }) {
  const { token, refresh, toast } = useStore();
  const [pattern, setPattern] = useState(editing?.pattern ?? '');
  const [matchType, setMatchType] = useState<MatchType>(editing?.matchType ?? 'CONTAINS');
  const [category, setCategory] = useState(editing?.categoryLabel ?? '');
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

// ------------------------------------------------------------------ import

function Import() {
  const { accounts, categories, token, refresh, toast } = useStore();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, { include: boolean; category: string }>>({});
  const [defExp, setDefExp] = useState('');
  const [defInc, setDefInc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onFile = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    // Swiss bank exports are frequently Latin-1; try that when UTF-8 shows replacement characters.
    reader.readAsText(f, 'utf-8');
  };

  const run = async () => {
    if (!token || !accountId || !csv.trim()) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const p = await api.importPreview(token, { accountId, csv });
      setPreview(p);
      const c: typeof choices = {};
      for (const r of p.rows) c[r.line] = { include: !r.duplicate, category: r.categoryLabel ?? '' };
      setChoices(c);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file'); setPreview(null); } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!token || !preview) return;
    const rows = preview.rows.filter((r) => choices[r.line]?.include).map((r) => ({ line: r.line, date: r.date, description: r.description, amount: r.amount, kind: r.kind, categoryLabel: choices[r.line]?.category || null }));
    if (!rows.length) return;
    setBusy(true); setError(null);
    try {
      const res = await api.importCommit(token, { accountId: preview.accountId, rows, defaultExpenseCategory: defExp || null, defaultIncomeCategory: defInc || null });
      setDone(`Booked ${res.booked} entries${res.skipped.length ? `, skipped ${res.skipped.length}: ${res.skipped.slice(0, 3).map((s) => `line ${s.line} (${s.reason})`).join(', ')}` : ''}.`);
      setPreview(null); setCsv('');
      toast(`Imported ${res.booked} entries`);
      await refresh(['core', 'budgets', 'insights', 'planned']);
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); } finally { setBusy(false); }
  };

  const selected = preview ? preview.rows.filter((r) => choices[r.line]?.include) : [];
  const missing = selected.filter((r) => !choices[r.line]?.category && !(r.kind === 'INCOME' ? defInc : defExp)).length;

  return (
    <div className="grid">
      <Section span="span-12" title="Import a statement">
        <p className="small muted" style={{ marginBottom: 12 }}>PostFinance and Revolut CSV exports are recognised automatically; any CSV with date, text and amount columns works too. Rows already booked on that day for the same amount are flagged as duplicates and left out.</p>
        <div className="row wrap" style={{ gap: 10 }}>
          <Field label="Into account" style={{ minWidth: 200 }}><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} /></Field>
          <Field label="File" grow><input className="input" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0] ?? null)} /></Field>
        </div>
        <Field label="…or paste the CSV" style={{ marginTop: 10 }}><textarea className="input" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Datum;Avisierungstext;Gutschrift in CHF;Lastschrift in CHF;…" /></Field>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn primary" onClick={run} disabled={busy || !csv.trim() || !accountId}>{busy ? 'Reading…' : 'Preview'}</button>
          {done ? <span className="small pos">{done}</span> : null}
        </div>
        <ErrorLine>{error}</ErrorLine>
      </Section>

      {preview ? (
        <Section span="span-12" title={`${preview.format} · ${preview.newCount} new, ${preview.duplicateCount} duplicates`} action={
          <span className="row" style={{ gap: 8 }}>
            {preview.statementClosingBalance !== null ? <span className="tiny faint">statement closes at {formatAmount(preview.statementClosingBalance)}</span> : null}
            <button className="btn primary sm" onClick={commit} disabled={busy || !selected.length || missing > 0}>{busy ? 'Booking…' : `Book ${selected.length}`}</button>
          </span>
        }>
          {preview.warnings.length ? <p className="tiny faint" style={{ marginBottom: 8 }}>{preview.warnings.slice(0, 4).join(' · ')}</p> : null}
          <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
            <Field label="Default for uncategorised expenses" style={{ minWidth: 220 }}><CategorySelect categories={categories} type="EXPENSE" value={defExp} onChange={setDefExp} allowEmpty="— none —" /></Field>
            <Field label="Default for uncategorised income" style={{ minWidth: 220 }}><CategorySelect categories={categories} type="INCOME" value={defInc} onChange={setDefInc} allowEmpty="— none —" /></Field>
            {missing > 0 ? <span className="small neg" style={{ alignSelf: 'end' }}>{missing} selected rows have no category</span> : null}
          </div>
          <div className="scroll-x"><table className="table">
            <thead><tr><th></th><th>Date</th><th>Text</th><th className="right">Amount</th><th>Category</th><th></th></tr></thead>
            <tbody>
              {preview.rows.map((r) => {
                const c = choices[r.line] ?? { include: false, category: '' };
                return (
                  <tr key={r.line} style={{ opacity: c.include ? 1 : 0.45 }}>
                    <td><input type="checkbox" checked={c.include} onChange={(e) => setChoices({ ...choices, [r.line]: { ...c, include: e.target.checked } })} /></td>
                    <td className="faint small" style={{ whiteSpace: 'nowrap' }}>{formatShortDate(r.date)}</td>
                    <td className="truncate" style={{ maxWidth: 320 }} title={r.rawDescription}>{r.description}{r.currencyMismatch ? <Tag tone="neg">{r.currency}</Tag> : null}</td>
                    <td className={`right amount money ${r.kind === 'INCOME' ? 'pos' : ''}`}>{r.kind === 'INCOME' ? '+' : '−'}{formatAmount(r.amount)}</td>
                    <td style={{ minWidth: 180 }}>
                      <CategorySelect categories={categories} type={r.kind === 'INCOME' ? 'INCOME' : 'EXPENSE'} value={c.category} onChange={(v) => setChoices({ ...choices, [r.line]: { ...c, category: v } })} allowEmpty={r.kind === 'INCOME' && defInc ? `default (${defInc})` : r.kind === 'EXPENSE' && defExp ? `default (${defExp})` : '— pick —'} />
                    </td>
                    <td>{r.duplicate ? <Tag>duplicate</Tag> : r.categoryLabel ? <Tag tone="pos">rule</Tag> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </Section>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ export

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
    <div className="grid">
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
    </div>
  );
}

// --------------------------------------------------------------- statement

function StatementView() {
  const { token, toast } = useStore();
  const last = new Date(); last.setMonth(last.getMonth() - 1);
  const [month, setMonth] = useState(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`);
  const [s, setS] = useState<Statement | null>(null);
  const [mail, setMail] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBusy(true);
    api.statement(token, month).then((r) => { if (!cancelled) setS(r); }).finally(() => { if (!cancelled) setBusy(false); });
    api.mailStatus(token).then((m) => setMail(m.configured)).catch(() => setMail(false));
    return () => { cancelled = true; };
  }, [token, month]);

  const send = async () => {
    if (!token) return;
    try { const r = await api.sendStatement(token, month); toast(`Sent to ${r.sentTo}`); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not send'); }
  };
  const openHtml = async () => {
    if (!token) return;
    const html = await api.statementHtml(token, month);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="grid">
      <Section span="span-12" title="Monthly statement" action={
        <span className="row" style={{ gap: 8 }}>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn sm" onClick={openHtml}>Open as page</button>
          <button className="btn sm primary" onClick={send} disabled={mail === false} title={mail === false ? 'Set SUMRY_MAIL_HOST on the API to enable email' : ''}>Email it</button>
        </span>
      }>
        {mail === false ? <p className="tiny faint" style={{ marginBottom: 10 }}>Email is off: the API has no SMTP configured (SUMRY_MAIL_HOST). The statement still works here.</p> : null}
        {busy && !s ? <Empty>Loading…</Empty> : s ? (
          <div className="grid" style={{ gap: 24 }}>
            <div className="span-4">
              <div className="caption">Net</div>
              <div className={`hero-value money ${s.net < 0 ? 'neg' : ''}`} style={{ marginTop: 6 }}>{s.net < 0 ? '−' : '+'}{formatAmount(s.net)}<span className="unit">{s.baseCurrency}</span></div>
              <div className="small muted" style={{ marginTop: 10 }}>{formatAmount(s.income)} in · {formatAmount(s.expense)} out{s.savingsRate !== null ? ` · ${Math.round(s.savingsRate * 100)}% saved` : ''}</div>
              <div className="small muted">Previous month: {formatAmount(s.previousIncome)} in · {formatAmount(s.previousExpense)} out</div>
              <div className="small muted" style={{ marginTop: 10 }}>Net worth {formatAmount(s.netWorth)} ({s.netWorthChange >= 0 ? '+' : '−'}{formatAmount(s.netWorthChange)}) · {s.entryCount} entries · subscriptions {formatAmount(s.subscriptionsMonthly)}/month</div>
            </div>
            <div className="span-4">
              <div className="caption" style={{ marginBottom: 6 }}>Where it went</div>
              <div className="list tight">
                {s.byCategory.map((c) => <div className="row-between" key={c.label}><span className="dot-row"><Swatch color={c.color ?? 'var(--ink-3)'} /><span className="truncate">{c.label}</span></span><span className="num money small">{formatAmount(c.amount)} <span className="faint">{Math.round(c.share * 100)}%</span></span></div>)}
              </div>
            </div>
            <div className="span-4">
              <div className="caption" style={{ marginBottom: 6 }}>Largest</div>
              <div className="list tight">
                {s.largest.map((e, i) => <div className="row-between" key={i}><span className="truncate"><span className="faint">{new Date(e.date).getDate()}.</span> {e.description ?? e.category}</span><span className="num money small">{formatAmount(e.amount)}</span></div>)}
              </div>
              {s.budgets.length ? <>
                <div className="caption" style={{ margin: '14px 0 6px' }}>Budgets</div>
                <div className="list tight">{s.budgets.map((b) => <div className="row-between" key={b.category}><span>{b.category}</span><span className={`num money small ${b.over ? 'neg' : ''}`}>{formatAmount(b.spent)} / {formatAmount(b.limit)}</span></div>)}</div>
              </> : null}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

// --------------------------------------------------------------- categories

function Categories() {
  const { categories, transactions } = useStore();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) if (t.categoryLabel) m.set(t.categoryLabel, (m.get(t.categoryLabel) ?? 0) + 1);
    return m;
  }, [transactions]);
  const groups = useMemo(() => {
    const g = new Map<string, Category[]>();
    for (const c of [...categories].sort((a, b) => a.label.localeCompare(b.label))) {
      const k = c.parentGroup ?? (c.categoryType === 'INCOME' ? 'Income' : 'Other');
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [categories]);

  return (
    <div className="grid">
      <Section span="span-12" title={`${categories.length} categories`} action={<button className="btn sm" onClick={() => setEditing(null)}>+ Category</button>}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {groups.map(([g, list]) => (
            <div key={g}>
              <div className="caption" style={{ marginBottom: 6 }}>{g}</div>
              <div className="list tight">
                {list.map((c) => (
                  <div className="row-between click" key={c.id} onClick={() => setEditing(c)} style={{ cursor: 'pointer' }}>
                    <span className="dot-row"><Swatch color={categoryColor(c.label, c.color)} /><span className="truncate">{c.label}</span>{c.categoryType === 'INCOME' ? <Tag tone="pos">in</Tag> : null}</span>
                    <span className="tiny faint">{usage.get(c.label) ?? 0}×</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
      {editing !== undefined ? <CategoryEditor editing={editing} onClose={() => setEditing(undefined)} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ account

function AccountSettings() {
  const { user, token, signOut, adoptToken, toast, preferences, refresh } = useStore();
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
      <Section span="span-12" title="Shortcuts">
        <div className="row wrap small muted" style={{ gap: 18 }}>
          <span><span className="kbd">⌘K</span> quick add</span>
          <span><span className="kbd">Enter</span> book it</span>
          <span><span className="kbd">Esc</span> close</span>
          <span>Try: <span className="mono">12.50 kebab cash yesterday</span> · <span className="mono">got 300 lohn</span> · <span className="mono">500 from pf to sparkonto</span> · <span className="mono">netflix 17.90 #Abos</span></span>
        </div>
      </Section>
    </div>
  );
}
