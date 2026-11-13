import { useState } from 'react';
import {
  type Budget,
  type BudgetPeriod,
  type Frequency,
  type Goal,
  type Occurrence,
  type Planned,
  CURRENCY,
  addDays,
  dayOf,
  formatAmount,
  formatShortDate,
  isoDay,
} from '../../core';
import { api } from '../api';
import { useStore } from '../store';
import { ErrorLine, Field, Modal, Switch } from '../ui';
import { AccountSelect, CategorySelect } from './Editor';

/** Editors for everything on Plan: planned items, budgets, goals, contributions, postponing. */

export const FREQ: { key: Frequency; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
  { key: 'ONCE', label: 'Once' },
];

const PERIODS: { key: BudgetPeriod; label: string }[] = [
  { key: 'WEEKLY', label: 'Weekly' },
  { key: 'MONTHLY', label: 'Monthly' },
  { key: 'YEARLY', label: 'Yearly' },
];

/** Moves one occurrence to another day; the move becomes a one-off plan on that date. */
export function PostponeEditor({ occurrence, onClose }: { occurrence: Occurrence; onClose: () => void }) {
  const { token, refresh, toast } = useStore();
  const from = dayOf(occurrence.date);
  const base = from < isoDay(new Date()) ? new Date() : new Date(`${from}T12:00:00`);
  const [to, setTo] = useState(isoDay(addDays(base, 7)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!token || !to) return;
    setBusy(true); setError(null);
    try {
      await api.postponePlanned(token, occurrence.plannedId, from, to);
      toast(`${occurrence.name} moved to ${formatShortDate(to)}`);
      await refresh(['planned', 'insights']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move it'); } finally { setBusy(false); }
  };
  const quick = (days: number) => setTo(isoDay(addDays(base, days)));
  return (
    <Modal title={`Postpone ${occurrence.name}`} onClose={onClose} footer={<>
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={busy || !to}>{busy ? 'Moving…' : 'Move'}</button>
    </>}>
      <p className="small muted">Due {formatShortDate(from)} · {formatAmount(occurrence.amount)} {occurrence.currency}. Only this occurrence moves; the plan keeps its rhythm.</p>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="chip" onClick={() => quick(1)}>+1 day</button>
        <button className="chip" onClick={() => quick(3)}>+3 days</button>
        <button className="chip" onClick={() => quick(7)}>+1 week</button>
        <button className="chip" onClick={() => quick(14)}>+2 weeks</button>
      </div>
      <Field label="New date" style={{ maxWidth: 200 }}><input className="input" type="date" value={to} min={isoDay(new Date())} onChange={(e) => setTo(e.target.value)} /></Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

export function PlannedEditor({ editing, prefill, onClose }: { editing: Planned | null; prefill: Partial<Planned> | null; onClose: () => void }) {
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

export function GoalEditor({ editing, onClose }: { editing: Goal | null; onClose: () => void }) {
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

export function ContributeEditor({ goal, onClose }: { goal: Goal; onClose: () => void }) {
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

export function BudgetEditor({ editing, onClose }: { editing: Budget | null; onClose: () => void }) {
  const { token, categories, budgets, refresh, toast } = useStore();
  const taken = new Set(budgets.map((b) => b.categoryLabel));
  const [category, setCategory] = useState(editing?.categoryLabel ?? '');
  const [limit, setLimit] = useState(editing ? editing.limitAmount.toFixed(2) : '');
  const [period, setPeriod] = useState<BudgetPeriod>(editing?.period ?? 'MONTHLY');
  const [rollover, setRollover] = useState(editing?.rollover ?? false);
  const [startDay, setStartDay] = useState(String(editing?.startDay ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number.parseFloat(limit.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && category;

  const save = async () => {
    if (!token || !valid) return;
    setBusy(true); setError(null);
    try {
      const sd = Math.min(28, Math.max(1, Number.parseInt(startDay) || 1));
      if (editing) await api.updateBudget(token, editing.id, { limitAmount: value, period, rollover, startDay: sd });
      else await api.createBudget(token, { categoryLabel: category, maxAmount: value, period, rollover, startDay: sd });
      toast('Saved');
      await refresh(['budgets']);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token || !editing || !window.confirm(`Remove the ${editing.categoryLabel} budget?`)) return;
    setBusy(true);
    try { await api.deleteBudget(token, editing.id); toast('Removed'); await refresh(['budgets']); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete'); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? `${editing.categoryLabel} budget` : 'New budget'} onClose={onClose} footer={<>
      {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Remove</button> : null}
      <span className="grow" />
      <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save'}</button>
    </>}>
      {!editing ? (
        <Field label="Category">
          <CategorySelect categories={categories.filter((c) => c.categoryType === 'EXPENSE' && !taken.has(c.label))} value={category} onChange={setCategory} allowEmpty="Choose…" />
        </Field>
      ) : null}
      <div className="field-row">
        <Field label={`Limit per period · ${CURRENCY}`} style={{ flex: '0 0 160px' }}>
          <input className="input serif num" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus placeholder="600.00" />
        </Field>
        <Field label="Period" grow>
          <div className="seg">{PERIODS.map((p) => <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>)}</div>
        </Field>
      </div>
      {period === 'MONTHLY' ? (
        <Field label="Month starts on day (1–28, e.g. payday)" style={{ maxWidth: 200 }}>
          <input className="input num" inputMode="numeric" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
        </Field>
      ) : null}
      <Switch checked={rollover} onChange={setRollover} label={<span>Roll over what is left (or overspent) into the next period</span>} />
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}
