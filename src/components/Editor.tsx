import { useEffect, useMemo, useState } from 'react';
import { api, type Transaction } from '../api';
import { useStore } from '../store';
import { isTransfer } from '../format';

/** A centred modal. Escape closes it, and a click on the backdrop does too. */
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        zIndex: 50,
      }}
    >
      <div
        className="card fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'var(--bg-elevated)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(88vh, 760px)',
        }}
      >
        <header className="card-head">
          <h2>{title}</h2>
          <button className="chip" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

const isoDate = (d: Date) => {
  // Local calendar date, not the UTC one — a late-evening entry must not shift a day.
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

/**
 * Create or edit a transaction.
 *
 * Transfers are edited as transfers (both legs at once); everything else is an ordinary
 * entry whose sign comes from the chosen category.
 */
export function TransactionEditor({
  editing,
  onClose,
}: {
  editing: Transaction | null;
  onClose: () => void;
}) {
  const { accounts, categories, transactions, token, refresh } = useStore();

  const transferLegs = useMemo(() => {
    if (!editing?.transferGroupId) return null;
    const legs = transactions.filter((t) => t.transferGroupId === editing.transferGroupId);
    return {
      out: legs.find((l) => l.kind === 'TRANSFER_OUT'),
      in: legs.find((l) => l.kind === 'TRANSFER_IN'),
    };
  }, [editing, transactions]);

  const [mode, setMode] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(() => {
    if (!editing) return 'EXPENSE';
    if (isTransfer(editing.kind)) return 'TRANSFER';
    return editing.kind === 'INCOME' ? 'INCOME' : 'EXPENSE';
  });
  const [amount, setAmount] = useState(editing ? editing.amount.toFixed(2) : '');
  const [categoryLabel, setCategoryLabel] = useState(editing?.categoryLabel ?? '');
  const [accountId, setAccountId] = useState(editing?.userAccountId ?? accounts[0]?.id ?? '');
  const [fromId, setFromId] = useState(transferLegs?.out?.userAccountId ?? accounts[0]?.id ?? '');
  const [toId, setToId] = useState(transferLegs?.in?.userAccountId ?? accounts[1]?.id ?? '');
  const [note, setNote] = useState(editing?.description ?? '');
  const [date, setDate] = useState(isoDate(editing ? new Date(editing.date) : new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = categories
    .filter((c) => c.categoryType === (mode === 'INCOME' ? 'INCOME' : 'EXPENSE'))
    .sort((a, b) => a.label.localeCompare(b.label));

  const value = Number.parseFloat(amount.replace(',', '.'));
  const valid =
    Number.isFinite(value) &&
    value > 0 &&
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
        const payload = {
          amount: value,
          description: note.trim() || null,
          fromAccountId: fromId,
          toAccountId: toId,
          date: when.toISOString(),
        };
        if (editing?.transferGroupId) {
          await api.updateTransfer(token, editing.transferGroupId, payload);
        } else {
          await api.createTransfer(token, payload);
        }
      } else {
        const payload = {
          amount: value,
          description: note.trim() || null,
          categoryLabel,
          date: when.toISOString(),
          userAccountId: accountId,
        };
        if (editing && !editing.transferGroupId) {
          await api.updateTransaction(token, editing.id, payload);
        } else {
          // A transfer cannot become an ordinary entry in place; replace it.
          if (editing?.transferGroupId) {
            await api.deleteTransfer(token, editing.transferGroupId);
          }
          await api.createTransaction(token, payload);
        }
      }
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !token) return;
    if (
      !window.confirm(
        editing.transferGroupId
          ? 'Delete this transfer? Both sides will be removed.'
          : 'Delete this transaction?',
      )
    )
      return;
    setBusy(true);
    try {
      if (editing.transferGroupId) await api.deleteTransfer(token, editing.transferGroupId);
      else await api.deleteTransaction(token, editing.id);
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Edit transaction' : 'New transaction'}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <button className="btn" onClick={remove} disabled={busy} style={{ color: 'var(--negative)' }}>
              Delete
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="chips">
          {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((m) => (
            <button
              key={m}
              className="chip"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                if (m !== 'TRANSFER') setCategoryLabel('');
              }}
            >
              {m === 'EXPENSE' ? 'Expense' : m === 'INCOME' ? 'Income' : 'Transfer'}
            </button>
          ))}
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: '0 0 130px' }}>
            <label className="caption" htmlFor="tx-amount">
              Amount
            </label>
            <input
              id="tx-amount"
              className="input num lg"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field grow">
            <label className="caption" htmlFor="tx-note">
              Note
            </label>
            <input
              id="tx-note"
              className="input lg"
              placeholder="What was it for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {mode === 'TRANSFER' ? (
          <>
            <label className="caption">From</label>
            <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                </option>
              ))}
            </select>
            <label className="caption">To</label>
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              {accounts
                .filter((a) => a.id !== fromId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName}
                  </option>
                ))}
            </select>
          </>
        ) : (
          <>
            <label className="caption">Category</label>
            <select
              className="input"
              value={categoryLabel}
              onChange={(e) => setCategoryLabel(e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((c) => (
                <option key={c.id} value={c.label}>
                  {c.parentGroup ? `${c.parentGroup} · ${c.label}` : c.label}
                </option>
              ))}
            </select>

            <label className="caption">Account</label>
            <select
              className="input"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="caption">Date</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        {error ? <div className="neg" style={{ fontSize: 13 }}>{error}</div> : null}
      </div>
    </Modal>
  );
}

/** Set an account's real balance; the difference is booked as an adjustment. */
export function ReconcileEditor({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const { accounts, token, refresh } = useStore();
  const account = accounts.find((a) => a.id === accountId);

  const [target, setTarget] = useState((account?.currentBalance ?? 0).toFixed(2));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number.parseFloat(target.replace(',', '.'));
  const diff = Number.isFinite(value) ? value - (account?.currentBalance ?? 0) : NaN;

  const submit = async () => {
    if (!Number.isFinite(value) || !token) return;
    setBusy(true);
    setError(null);
    try {
      await api.reconcileAccount(token, accountId, value, note.trim() || 'Abgleich');
      await refresh();
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
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={submit}
            disabled={busy || !Number.isFinite(value)}
          >
            {busy ? 'Adjusting…' : 'Adjust'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
          Enter what the account really shows. The difference is booked as an
          “Einstellung” transaction, so your history keeps adding up to the balance.
        </p>

        <label className="caption">Recorded balance</label>
        <div className="num" style={{ fontSize: 20 }}>
          {(account?.currentBalance ?? 0).toFixed(2)}
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: '0 0 130px' }}>
            <label className="caption" htmlFor="rec-balance">
              Real balance
            </label>
            <input
              id="rec-balance"
              className="input num lg"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field grow">
            <label className="caption" htmlFor="rec-note">
              Note
            </label>
            <input
              id="rec-note"
              className="input lg"
              placeholder="Abgleich"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {Number.isFinite(diff) ? (
          <div style={{ fontSize: 13 }}>
            Adjustment:{' '}
            <strong className={`num ${Math.abs(diff) < 0.005 ? 'faint' : diff > 0 ? 'pos' : 'neg'}`}>
              {diff >= 0 ? '+' : '−'}
              {Math.abs(diff).toFixed(2)}
            </strong>
            {Math.abs(diff) < 0.005 ? <span className="faint"> — nothing to book</span> : null}
          </div>
        ) : null}

        {error ? <div className="neg" style={{ fontSize: 13 }}>{error}</div> : null}
      </div>
    </Modal>
  );
}
