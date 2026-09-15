import { useMemo, useState } from 'react';
import { api, type Frequency, type Goal, type Planned, type Subscription } from '../api';
import { categoryColor, useStore } from '../store';
import { Empty, ErrorLine, Field, Meter, Modal, Num, Section, Stat, Swatch, Switch, Tag } from '../ui';
import { AccountSelect, CategorySelect } from '../components/Editor';
import { CURRENCY, formatAmount, formatLongDate, isoDay, relativeDays } from '../format';

const FREQ: { key: Frequency; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
  { key: 'ONCE', label: 'Once' },
];

export function Plan() {
  const { planned, upcoming, goals, subscriptions, safe, token, refresh, toast } = useStore();
  const [plannedEditor, setPlannedEditor] = useState<Planned | null | undefined>(undefined);
  const [prefill, setPrefill] = useState<Partial<Planned> | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | null | undefined>(undefined);
  const [contributing, setContributing] = useState<Goal | null>(null);

  const monthlyOut = planned.filter((p) => p.isActive && p.kind === 'EXPENSE').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const monthlyIn = planned.filter((p) => p.isActive && p.kind === 'INCOME').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const monthlySave = planned.filter((p) => p.isActive && p.kind === 'TRANSFER_OUT').reduce((s, p) => s + p.monthlyEquivalent, 0);
  const grouped = useMemo(() => {
    const g: Record<string, Planned[]> = { INCOME: [], EXPENSE: [], TRANSFER_OUT: [] };
    for (const p of planned) (g[p.kind] ?? g.EXPENSE).push(p);
    return g;
  }, [planned]);

  const book = async (id: string) => {
    if (!token) return;
    try { await api.bookPlanned(token, id); toast('Booked'); await refresh(['core', 'planned', 'budgets', 'insights']); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not book'); }
  };
  const planSubscription = (s: Subscription) => {
    setPrefill({ name: s.name, amount: s.medianAmount, frequency: s.interval === 'QUARTERLY' ? 'MONTHLY' : s.interval, categoryLabel: s.categoryLabel, accountId: s.accountId ?? undefined, startDate: s.nextExpected });
    setPlannedEditor(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Plan</h1>
          <p className="sub">What is going to happen to the money, and what you are saving toward.</p>
        </div>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setGoalEditor(null)}>+ Goal</button>
          <button className="btn primary" onClick={() => { setPrefill(null); setPlannedEditor(null); }}>+ Planned</button>
        </span>
      </div>

      <div className="grid">
        <Section span="span-12" title="Every month, on average">
          <div className="stats">
            <Stat label="Planned income" value={<Num value={monthlyIn} />} />
            <Stat label="Planned expenses" value={<Num value={monthlyOut} />} />
            <Stat label="Planned savings" value={<Num value={monthlySave} />} />
            <Stat label="Left for everything else" value={<Num value={monthlyIn - monthlyOut - monthlySave} format={(v) => `${v < 0 ? '−' : ''}${formatAmount(v)}`} />} foot={safe ? <span className="tiny faint">safe to spend now {formatAmount(safe.safeToSpend)}</span> : null} />
          </div>
        </Section>

        <Section span="span-5" title="Next 45 days">
          {upcoming.length ? (
            <div className="list tight">
              {upcoming.map((o) => (
                <div className="row-between" key={`${o.plannedId}-${o.date}`}>
                  <span className="dot-row" style={{ minWidth: 0 }}>
                    <span className={`tiny ${o.overdue ? 'neg' : 'faint'}`} style={{ width: 70, flex: '0 0 auto' }}>{o.overdue ? 'overdue' : relativeDays(o.date)}</span>
                    <Swatch color={o.categoryColor ?? 'var(--ink-3)'} />
                    <span className="truncate">{o.name}</span>
                    {o.autoBook ? <Tag>auto</Tag> : null}
                  </span>
                  <span className="row" style={{ gap: 8, flex: '0 0 auto' }}>
                    <span className={`num money ${o.kind === 'INCOME' ? 'pos' : ''}`}>{o.kind === 'INCOME' ? '+' : o.kind === 'TRANSFER_OUT' ? '⇄ ' : '−'}{formatAmount(o.amount)}</span>
                    {!o.autoBook && (o.overdue || o.date <= isoDay(new Date())) ? <button className="btn sm" onClick={() => book(o.plannedId)}>Book</button> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing due. Plans you add appear here as dated items.</Empty>}
        </Section>

        <Section span="span-7" title="Planned">
          {planned.length ? (
            <div className="scroll-x">
              <table className="table">
                <thead><tr><th>Name</th><th className="hide-sm">Every</th><th>Next</th><th className="hide-sm">Account</th><th className="right">Amount</th><th className="right hide-sm">/ month</th><th></th></tr></thead>
                <tbody>
                  {(['INCOME', 'EXPENSE', 'TRANSFER_OUT'] as const).flatMap((k) => grouped[k].map((p) => (
                    <tr key={p.id} className="click" onClick={() => { setPrefill(null); setPlannedEditor(p); }} style={{ opacity: p.isActive ? 1 : 0.5 }}>
                      <td><span className="dot-row"><Swatch color={p.kind === 'TRANSFER_OUT' ? 'var(--ink-3)' : categoryColor(p.categoryLabel ?? '', p.categoryColor)} /><span className="truncate">{p.name}</span>{p.autoBook ? <Tag>auto</Tag> : null}{!p.isActive ? <Tag>paused</Tag> : null}</span></td>
                      <td className="faint small hide-sm">{p.frequency.toLowerCase()}</td>
                      <td className="small muted">{p.nextDate ? relativeDays(p.nextDate) : '—'}</td>
                      <td className="faint small hide-sm">{p.kind === 'TRANSFER_OUT' ? `${p.accountName} → ${p.toAccountName}` : p.accountName}</td>
                      <td className={`right amount money ${p.kind === 'INCOME' ? 'pos' : ''}`}>{p.kind === 'INCOME' ? '+' : p.kind === 'TRANSFER_OUT' ? '' : '−'}{formatAmount(p.amount)}</td>
                      <td className="right num faint small hide-sm money">{formatAmount(p.monthlyEquivalent)}</td>
                      <td className="right"><button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); book(p.id); }}>Book</button></td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Add rent, salary and the subscriptions you know about. "Safe to spend" on the home page is built from these.</Empty>}
        </Section>

        <Section span="span-7" title="Goals">
          {goals.length ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
              {goals.map((g) => (
                <div className="panel" key={g.id} style={{ opacity: g.isActive ? 1 : 0.5 }}>
                  <div className="row-between">
                    <strong>{g.name}</strong>
                    {g.achieved ? <Tag tone="pos">reached</Tag> : g.onTrack === false ? <Tag tone="neg">behind</Tag> : g.onTrack ? <Tag tone="pos">on track</Tag> : null}
                  </div>
                  <div className="row-between" style={{ alignItems: 'baseline', marginTop: 8 }}>
                    <span className="serif money" style={{ fontSize: 26 }}>{formatAmount(g.current)}</span>
                    <span className="small muted">of <span className="num money">{formatAmount(g.targetAmount)}</span></span>
                  </div>
                  <div style={{ margin: '8px 0' }}><Meter ratio={g.targetAmount > 0 ? g.current / g.targetAmount : 0} tone="ok" /></div>
                  <div className="tiny faint">
                    {g.accountName ? `tracks ${g.accountName}` : 'manual'}
                    {g.targetDate ? ` · by ${formatLongDate(g.targetDate)}` : ''}
                    {g.requiredPerMonth !== null && !g.achieved ? ` · ${formatAmount(g.requiredPerMonth)}/month needed` : ''}
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 10 }}>
                    <button className="btn sm" onClick={() => setContributing(g)} disabled={g.achieved}>Add money</button>
                    <button className="btn sm ghost" onClick={() => setGoalEditor(g)}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty>A goal is a target amount, optionally by a date. Link it to Sparkonto and it tracks that balance.</Empty>}
        </Section>

        <Section span="span-5" title="Subscriptions found" action={subscriptions ? <span className="tiny faint">{formatAmount(subscriptions.monthlyTotal)}/month · {formatAmount(subscriptions.yearlyTotal)}/year</span> : null}>
          {subscriptions?.subscriptions.length ? (
            <div className="list tight">
              {subscriptions.subscriptions.map((s) => (
                <div className="row-between" key={s.name}>
                  <span className="dot-row" style={{ minWidth: 0 }}>
                    <Swatch color={s.categoryColor ?? 'var(--ink-3)'} />
                    <span className="truncate" style={{ opacity: s.active ? 1 : 0.5 }}>{s.name}</span>
                    <span className="tiny faint">{s.interval.toLowerCase()} · {s.occurrences}×</span>
                  </span>
                  <span className="row" style={{ gap: 8, flex: '0 0 auto' }}>
                    <span className="num money small">{formatAmount(s.medianAmount)}</span>
                    {s.planned ? <Tag tone="pos">planned</Tag> : s.active ? <button className="btn sm ghost" onClick={() => planSubscription(s)}>Plan it</button> : <Tag>ended</Tag>}
                  </span>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing recurring detected yet. This needs three or more payments of the same thing at a steady interval.</Empty>}
        </Section>
      </div>

      {plannedEditor !== undefined ? <PlannedEditor editing={plannedEditor} prefill={prefill} onClose={() => { setPlannedEditor(undefined); setPrefill(null); }} /> : null}
      {goalEditor !== undefined ? <GoalEditor editing={goalEditor} onClose={() => setGoalEditor(undefined)} /> : null}
      {contributing ? <ContributeEditor goal={contributing} onClose={() => setContributing(null)} /> : null}
    </>
  );
}

function PlannedEditor({ editing, prefill, onClose }: { editing: Planned | null; prefill: Partial<Planned> | null; onClose: () => void }) {
  const { token, accounts, categories, refresh, toast } = useStore();
  const base = editing ?? prefill;
  const [mode, setMode] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(base?.kind === 'INCOME' ? 'INCOME' : base?.kind === 'TRANSFER_OUT' ? 'TRANSFER' : 'EXPENSE');
  const [name, setName] = useState(base?.name ?? '');
  const [amount, setAmount] = useState(base?.amount ? base.amount.toFixed(2) : '');
  const [frequency, setFrequency] = useState<Frequency>(base?.frequency ?? 'MONTHLY');
  const [startDate, setStartDate] = useState(base?.startDate ?? isoDay(new Date()));
  const [endDate, setEndDate] = useState(base?.endDate ?? '');
  const [category, setCategory] = useState(base?.categoryLabel ?? '');
  const [accountId, setAccountId] = useState(base?.accountId ?? accounts[0]?.id ?? '');
  const [toId, setToId] = useState(base?.toAccountId ?? accounts.find((a) => a.id !== (base?.accountId ?? accounts[0]?.id))?.id ?? '');
  const [autoBook, setAutoBook] = useState(base?.autoBook ?? false);
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number.parseFloat(amount.replace(',', '.'));
  const valid = name.trim() && Number.isFinite(value) && value > 0 && startDate && (mode === 'TRANSFER' ? toId && toId !== accountId : category);

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      if (editing) {
        await api.updatePlanned(token, editing.id, {
          name: name.trim(), amount: value, frequency, startDate, endDate: endDate || undefined, clearEndDate: !endDate, accountId,
          ...(mode === 'TRANSFER' ? { toAccountId: toId } : { categoryLabel: category }), autoBook, isActive: active,
        });
      } else {
        await api.createPlanned(token, {
          name: name.trim(), amount: value, frequency, startDate, endDate: endDate || null, accountId,
          categoryLabel: mode === 'TRANSFER' ? null : category, toAccountId: mode === 'TRANSFER' ? toId : null, autoBook,
        });
      }
      toast('Saved');
      await refresh(['planned', 'insights']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !editing || !window.confirm(`Delete “${editing.name}”? Booked entries stay.`)) return;
    setBusy(true);
    try { await api.deletePlanned(token, editing.id); toast('Deleted'); await refresh(['planned', 'insights']); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit plan' : 'New plan'} onClose={onClose} footer={<>
      {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Delete</button> : null}
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'EXPENSE' ? 'Expense' : m === 'INCOME' ? 'Income' : 'Transfer'}</button>)}
      </div>
      <div className="field-row">
        <Field label="Name" grow><input className="input lg" value={name} onChange={(e) => setName(e.target.value)} placeholder={mode === 'INCOME' ? 'Lohn' : mode === 'TRANSFER' ? 'Sparen' : 'Miete'} autoFocus /></Field>
        <Field label={`Amount · ${accounts.find((a) => a.id === accountId)?.currency ?? CURRENCY}`} style={{ flex: '0 0 150px' }}><input className="input serif num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Every" grow><div className="seg">{FREQ.map((f) => <button key={f.key} aria-pressed={frequency === f.key} onClick={() => setFrequency(f.key)}>{f.label}</button>)}</div></Field>
      </div>
      <div className="field-row">
        <Field label={frequency === 'ONCE' ? 'On' : 'First / anchor date'} grow><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        {frequency !== 'ONCE' ? <Field label="Until (optional)" grow><input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field> : null}
      </div>
      <div className="field-row">
        <Field label={mode === 'TRANSFER' ? 'From' : 'Account'} grow><AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} /></Field>
        {mode === 'TRANSFER'
          ? <Field label="To" grow><AccountSelect accounts={accounts.filter((a) => a.id !== accountId)} value={toId} onChange={setToId} /></Field>
          : <Field label="Category" grow><CategorySelect categories={categories} type={mode} value={category} onChange={setCategory} allowEmpty="Choose…" /></Field>}
      </div>
      <Switch checked={autoBook} onChange={setAutoBook} label={<span>Book automatically when due <span className="faint">(otherwise it is a reminder you book with one click)</span></span>} />
      {editing ? <Switch checked={active} onChange={setActive} label="Active" /> : null}
      <p className="tiny faint">A date in the past is fine: earlier occurrences count as already in the history.</p>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

function GoalEditor({ editing, onClose }: { editing: Goal | null; onClose: () => void }) {
  const { token, accounts, refresh, toast } = useStore();
  const [name, setName] = useState(editing?.name ?? '');
  const [target, setTarget] = useState(editing ? editing.targetAmount.toFixed(2) : '');
  const [date, setDate] = useState(editing?.targetDate ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? '');
  const [saved, setSaved] = useState(editing && !editing.accountId ? editing.current.toFixed(2) : '0.00');
  const [active, setActive] = useState(editing?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number.parseFloat(target.replace(',', '.'));
  const valid = name.trim() && Number.isFinite(value) && value > 0;

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      if (editing) {
        await api.updateGoal(token, editing.id, { name: name.trim(), targetAmount: value, targetDate: date || undefined, clearTargetDate: !date, accountId: accountId || undefined, clearAccount: !accountId, savedAmount: accountId ? undefined : Number.parseFloat(saved) || 0, isActive: active });
      } else {
        await api.createGoal(token, { name: name.trim(), targetAmount: value, targetDate: date || null, accountId: accountId || null, savedAmount: accountId ? null : Number.parseFloat(saved) || 0 });
      }
      toast('Saved');
      await refresh(['goals']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !editing || !window.confirm(`Delete the goal “${editing.name}”?`)) return;
    setBusy(true);
    try { await api.deleteGoal(token, editing.id); toast('Deleted'); await refresh(['goals']); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? 'Edit goal' : 'New goal'} onClose={onClose} footer={<>
      {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Delete</button> : null}
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      <div className="field-row">
        <Field label="Name" grow><input className="input lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Notgroschen" autoFocus /></Field>
        <Field label={`Target · ${CURRENCY}`} style={{ flex: '0 0 150px' }}><input className="input serif num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="By (optional)" grow><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Tracks account (optional)" grow>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Keep my own count</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
        </Field>
      </div>
      {!accountId ? <Field label="Already set aside" style={{ maxWidth: 200 }}><input className="input num" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} /></Field> : <p className="tiny faint">Linked to an account, the goal's progress is that account's balance and contributions are real transfers into it.</p>}
      {editing ? <Switch checked={active} onChange={setActive} label="Active" /> : null}
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

function ContributeEditor({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { token, accounts, refresh, toast } = useStore();
  const [amount, setAmount] = useState(goal.requiredPerMonth ? goal.requiredPerMonth.toFixed(2) : '');
  const [from, setFrom] = useState(accounts.find((a) => a.id !== goal.accountId)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number.parseFloat(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && (!goal.accountId || from);

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      await api.contributeGoal(token, goal.id, value, goal.accountId ? from : null);
      toast(`Added ${formatAmount(value)} to ${goal.name}`);
      await refresh(['goals', 'core']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add'); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Add to ${goal.name}`} onClose={onClose} footer={<>
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Adding…' : 'Add'}</button>
    </>}>
      <div className="field-row">
        <Field label={`Amount · ${CURRENCY}`} style={{ flex: '0 0 150px' }}><input className="input serif num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
        {goal.accountId ? <Field label={`From → ${goal.accountName}`} grow><AccountSelect accounts={accounts.filter((a) => a.id !== goal.accountId)} value={from} onChange={setFrom} /></Field> : null}
      </div>
      <p className="tiny faint">{goal.accountId ? 'This books a real transfer between the two accounts.' : 'This only raises the goal\'s own counter; no transaction is written.'}</p>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}
