import { useEffect, useMemo, useState } from 'react';
import {
  type Account,
  type Category,
  type Transaction,
  formatAmount,
  isTransfer,
  isoDay,
} from '../../core';
import { api } from '../api';
import { useStore } from '../store';
import { ErrorLine, Field, Modal, Switch } from '../ui';

const parseNum = (s: string) => Number.parseFloat(s.replace(/'/g, '').replace(',', '.'));

/**
 * Create or edit a transaction.
 *
 * Transfers are edited as transfers (both legs at once); everything else is an ordinary
 * entry whose sign comes from the chosen category.
 */
export function TransactionEditor({ editing, onClose, presetAccountId }: { editing: Transaction | null; onClose: () => void; presetAccountId?: string }) {
  const { accounts, categories, transactions, token, refresh, toast } = useStore();

  const transferLegs = useMemo(() => {
    if (!editing?.transferGroupId) return null;
    const legs = transactions.filter((t) => t.transferGroupId === editing.transferGroupId);
    return { out: legs.find((l) => l.kind === 'TRANSFER_OUT'), in: legs.find((l) => l.kind === 'TRANSFER_IN') };
  }, [editing, transactions]);

  const [mode, setMode] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(() => {
    if (!editing) return 'EXPENSE';
    if (isTransfer(editing.kind)) return 'TRANSFER';
    return editing.kind === 'INCOME' ? 'INCOME' : 'EXPENSE';
  });
  const [amount, setAmount] = useState(editing ? (transferLegs?.out?.amount ?? editing.amount).toFixed(2) : '');
  const [toAmount, setToAmount] = useState(transferLegs?.in ? transferLegs.in.amount.toFixed(2) : '');
  const [categoryLabel, setCategoryLabel] = useState(editing?.categoryLabel ?? '');
  const [accountId, setAccountId] = useState(editing?.userAccountId ?? presetAccountId ?? accounts[0]?.id ?? '');
  const [fromId, setFromId] = useState(transferLegs?.out?.userAccountId ?? presetAccountId ?? accounts[0]?.id ?? '');
  const [toId, setToId] = useState(transferLegs?.in?.userAccountId ?? accounts.find((a) => a.id !== (presetAccountId ?? accounts[0]?.id))?.id ?? '');
  const [note, setNote] = useState(editing?.description ?? '');
  const [date, setDate] = useState(isoDay(editing ? new Date(editing.date) : new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The category a rule filled in, so it can be swapped or cleared as the note changes.
  // A category picked by hand (or already on an edited entry) is never overridden, and
  // once Expense/Income is picked by hand only rules of that kind apply.
  const [ruleCategory, setRuleCategory] = useState<string | null>(null);
  const [categoryPicked, setCategoryPicked] = useState(Boolean(editing?.categoryLabel));
  const [modePicked, setModePicked] = useState(Boolean(editing));

  useEffect(() => {
    if (!token || mode === 'TRANSFER' || categoryPicked) return;
    const description = note.trim();
    const timer = window.setTimeout(async () => {
      let match: string | null = null;
      if (description) {
        try {
          match = (await api.testRule(token, description, accountId || null)).categoryLabel;
        } catch {
          return;
        }
      }
      const category = match ? categories.find((c) => c.label === match) : undefined;
      if (category && (!modePicked || category.categoryType === mode)) {
        setMode(category.categoryType === 'INCOME' ? 'INCOME' : 'EXPENSE');
        setCategoryLabel(category.label);
        setRuleCategory(category.label);
      } else if (ruleCategory) {
        setCategoryLabel('');
        setRuleCategory(null);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [note, accountId, token, mode, modePicked, categoryPicked]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = categories
    .filter((c) => c.categoryType === (mode === 'INCOME' ? 'INCOME' : 'EXPENSE'))
    .sort((a, b) => a.label.localeCompare(b.label));

  const value = parseNum(amount);
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const crossCurrency = mode === 'TRANSFER' && from && to && from.currency !== to.currency;
  const valid =
    Number.isFinite(value) && value > 0 &&
    (mode === 'TRANSFER' ? fromId && toId && fromId !== toId : categoryLabel && accountId);

  const save = async () => {
    if (!valid || !token) return;
    setBusy(true);
    setError(null);
    // Preserve the original time of day when editing; new entries land at noon so a
    // timezone shift can never move them to the previous day.
    const when = editing
      ? new Date(`${date}T${new Date(editing.date).toTimeString().slice(0, 8)}`)
      : new Date(`${date}T12:00:00`);
    try {
      if (mode === 'TRANSFER') {
        const ta = parseNum(toAmount);
        const payload = {
          amount: value,
          description: note.trim() || null,
          fromAccountId: fromId,
          toAccountId: toId,
          date: when.toISOString(),
          toAmount: crossCurrency && Number.isFinite(ta) && ta > 0 ? ta : null,
        };
        if (editing?.transferGroupId) await api.updateTransfer(token, editing.transferGroupId, payload);
        else await api.createTransfer(token, payload);
      } else {
        const payload = { amount: value, description: note.trim() || null, categoryLabel, date: when.toISOString(), userAccountId: accountId };
        if (editing && !editing.transferGroupId) {
          await api.updateTransaction(token, editing.id, payload);
        } else {
          // A transfer cannot become an ordinary entry in place; replace it.
          if (editing?.transferGroupId) await api.deleteTransfer(token, editing.transferGroupId);
          await api.createTransaction(token, payload);
        }
      }
      toast(editing ? 'Saved' : 'Booked');
      await refresh(['core', 'planned', 'budgets', 'insights']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !token) return;
    if (!window.confirm(editing.transferGroupId ? 'Delete this transfer? Both sides will be removed.' : 'Delete this transaction?')) return;
    setBusy(true);
    try {
      if (editing.transferGroupId) await api.deleteTransfer(token, editing.transferGroupId);
      else await api.deleteTransaction(token, editing.id);
      toast('Deleted');
      await refresh(['core', 'planned', 'budgets', 'insights']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  const currency = mode === 'TRANSFER' ? from?.currency : accounts.find((a) => a.id === accountId)?.currency;

  return (
    <Modal
      title={editing ? 'Edit entry' : 'New entry'}
      onClose={onClose}
      footer={
        <>
          {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Delete</button> : null}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!valid || busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Book'}</button>
        </>
      }
    >
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setModePicked(true);
              if (m !== 'TRANSFER') { setCategoryLabel(''); setRuleCategory(null); setCategoryPicked(false); }
            }}
          >
            {m === 'EXPENSE' ? 'Expense' : m === 'INCOME' ? 'Income' : 'Transfer'}
          </button>
        ))}
      </div>

      <div className="field-row">
        <Field label={`Amount${currency ? ` · ${currency}` : ''}`} style={{ flex: '0 0 150px' }}>
          <input className="input serif num" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Note" grow>
          <input className="input lg" placeholder="What was it for?" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {mode === 'TRANSFER' ? (
        <>
          <div className="field-row">
            <Field label="From" grow>
              <AccountSelect accounts={accounts} value={fromId} onChange={setFromId} />
            </Field>
            <Field label="To" grow>
              <AccountSelect accounts={accounts.filter((a) => a.id !== fromId)} value={toId} onChange={setToId} />
            </Field>
          </div>
          {crossCurrency ? (
            <Field label={`Arrives as · ${to?.currency} (blank = today's rate)`}>
              <input className="input num" inputMode="decimal" placeholder="auto" value={toAmount} onChange={(e) => setToAmount(e.target.value)} />
            </Field>
          ) : null}
        </>
      ) : (
        <div className="field-row">
          <Field label={`Category${ruleCategory && ruleCategory === categoryLabel ? ' · rule' : ''}`} grow>
            <select
              className="input"
              value={categoryLabel}
              onChange={(e) => { setCategoryLabel(e.target.value); setRuleCategory(null); setCategoryPicked(Boolean(e.target.value)); }}
            >
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={c.label}>{c.parentGroup ? `${c.parentGroup} · ${c.label}` : c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Account" grow>
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
          </Field>
        </div>
      )}

      <Field label="Date" style={{ maxWidth: 200 }}>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

export function AccountSelect({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.accountName}{a.currency !== 'CHF' ? ` (${a.currency})` : ''}</option>
      ))}
    </select>
  );
}

export function CategorySelect({ categories, value, onChange, type, allowEmpty }: { categories: Category[]; value: string; onChange: (v: string) => void; type?: 'INCOME' | 'EXPENSE'; allowEmpty?: string }) {
  const list = categories.filter((c) => !type || c.categoryType === type).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : null}
      {list.map((c) => (
        <option key={c.id} value={c.label}>{c.parentGroup ? `${c.parentGroup} · ${c.label}` : c.label}{c.categoryType === 'INCOME' && !type ? ' (income)' : ''}</option>
      ))}
    </select>
  );
}

/** Set an account's real balance; the difference is booked as an adjustment. */
export function ReconcileEditor({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { accounts, token, refresh, toast } = useStore();
  const account = accounts.find((a) => a.id === accountId);
  const [target, setTarget] = useState((account?.currentBalance ?? 0).toFixed(2));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseNum(target);
  const diff = Number.isFinite(value) ? value - (account?.currentBalance ?? 0) : NaN;

  const submit = async () => {
    if (!Number.isFinite(value) || !token) return;
    setBusy(true);
    setError(null);
    try {
      await api.reconcileAccount(token, accountId, value, note.trim() || 'Abgleich');
      toast('Adjusted');
      await refresh(['core']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not adjust');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Adjust ${account?.accountName ?? 'account'}`}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !Number.isFinite(value)}>{busy ? 'Adjusting…' : 'Adjust'}</button>
        </>
      }
    >
      <p className="small muted">Enter what the account really shows. The difference is booked as an “Einstellung” entry so the history keeps adding up to the balance.</p>
      <div className="field-row">
        <Field label="Recorded" style={{ flex: '0 0 130px' }}>
          <div className="serif num money" style={{ fontSize: 22, padding: '6px 0' }}>{formatAmount(account?.currentBalance ?? 0)}</div>
        </Field>
        <Field label={`Real balance · ${account?.currency ?? ''}`} style={{ flex: '0 0 150px' }}>
          <input className="input serif num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} autoFocus />
        </Field>
        <Field label="Note" grow>
          <input className="input lg" placeholder="Abgleich" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {Number.isFinite(diff) ? (
        <div className="small">
          Adjustment:{' '}
          <strong className={`num money ${Math.abs(diff) < 0.005 ? 'faint' : diff > 0 ? 'pos' : 'neg'}`}>
            {diff >= 0 ? '+' : '−'}{formatAmount(diff)}
          </strong>
          {Math.abs(diff) < 0.005 ? <span className="faint"> — nothing to book</span> : null}
        </div>
      ) : null}
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

/** Create or rename an account, set its currency. */
export function AccountEditor({ editing, onClose }: { editing: Account | null; onClose: () => void }) {
  const { token, refresh, toast } = useStore();
  const [name, setName] = useState(editing?.accountName ?? '');
  const [currency, setCurrency] = useState(editing?.currency ?? 'CHF');
  const [spending, setSpending] = useState(editing?.spending ?? true);
  const [balance, setBalance] = useState('0.00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.updateAccount(token, editing.id, { accountName: name.trim(), currency, spending });
      else await api.createAccount(token, name.trim(), parseNum(balance) || 0, currency, spending);
      toast(editing ? 'Saved' : 'Account created');
      await refresh(['core']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!token || !editing) return;
    if (!window.confirm(`Delete ${editing.accountName}? This only works when it has no entries.`)) return;
    setBusy(true);
    try {
      await api.deleteAccount(token, editing.id);
      toast('Deleted');
      await refresh(['core']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit account' : 'New account'}
      onClose={onClose}
      footer={
        <>
          {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Delete</button> : null}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="field-row">
        <Field label="Name" grow>
          <input className="input lg" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="PostFinance" />
        </Field>
        <Field label="Currency" style={{ flex: '0 0 110px' }}>
          <input className="input lg" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </Field>
      </div>
      {!editing ? (
        <Field label="Opening balance" style={{ maxWidth: 200 }}>
          <input className="input serif num" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
      ) : null}
      <Switch checked={spending} onChange={setSpending} label={<span>Counts toward safe to spend <span className="faint">(turn off for savings)</span></span>} />
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}

/** Create or edit a category. Deleting deactivates it; history keeps the label. */
export function CategoryEditor({ editing, onClose }: { editing: Category | null; onClose: () => void }) {
  const { token, refresh, toast, categories } = useStore();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [group, setGroup] = useState(editing?.parentGroup ?? '');
  const [color, setColor] = useState(editing?.color ?? '#9a6b1f');
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>(editing?.categoryType ?? 'EXPENSE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = [...new Set(categories.map((c) => c.parentGroup).filter(Boolean))] as string[];

  const submit = async () => {
    if (!token || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.updateCategory(token, { label: editing.label, newLabel: label.trim() !== editing.label ? label.trim() : undefined, parentGroup: group.trim() || null, color, categoryType: type });
      } else {
        await api.createCategory(token, { label: label.trim(), parentGroup: group.trim() || null, color, categoryType: type });
      }
      toast('Saved');
      await refresh(['core']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!token || !editing || !window.confirm(`Retire “${editing.label}”? Existing entries keep it; it just stops being offered.`)) return;
    setBusy(true);
    try {
      await api.deleteCategory(token, editing.label);
      toast('Retired');
      await refresh(['core']);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit category' : 'New category'}
      onClose={onClose}
      footer={
        <>
          {editing ? <button className="btn danger" onClick={remove} disabled={busy}>Retire</button> : null}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !label.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <button aria-pressed={type === 'EXPENSE'} onClick={() => setType('EXPENSE')}>Expense</button>
        <button aria-pressed={type === 'INCOME'} onClick={() => setType('INCOME')}>Income</button>
      </div>
      <div className="field-row">
        <Field label="Label" grow>
          <input className="input lg" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>
        <Field label="Colour" style={{ flex: '0 0 70px' }}>
          <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 2, height: 42 }} />
        </Field>
      </div>
      <Field label="Group">
        <input className="input" list="cat-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Essen, Wohnen, …" />
        <datalist id="cat-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
      </Field>
      <ErrorLine>{error}</ErrorLine>
    </Modal>
  );
}
