import { useEffect, useMemo, useState } from 'react';
import {
  type Cashflow,
  type Transaction,
  CURRENCY,
  RECONCILE_AFTER_DAYS,
  daysBetween,
  dayOf,
  formatAmount,
  formatLongDate,
  formatSigned,
  formatShortDate,
  isoDay,
  balanceSeries,
  relativeDays,
  resolveRange,
} from '../../core';
import { api } from '../api';
import { href, navigate, useStore, type Route } from '../store';
import { Empty, ErrorLine, Section, Stat, Switch, Tag } from '../ui';
import { TrendLine } from '../charts';
import { PageHead } from '../components/Nav';
import { TxList } from '../components/TxList';
import { AccountEditor, TransactionEditor } from '../components/Editor';

/** One account: balance over time, this month's flow, the bank check, its entries. */
export function AccountDetail({ route }: { route: Route }) {
  const { accounts, transactions, upcoming, goals, token, refresh, toast } = useStore();
  const id = route.params.get('id') ?? '';
  const account = accounts.find((a) => a.id === id);
  const [cashflow, setCashflow] = useState<Cashflow | null>(null);
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<Transaction | null | undefined>(undefined);
  const focusReconcile = route.params.get('reconcile') === '1';

  useEffect(() => {
    if (!token || !id) return;
    api.cashflow(token, id).then(setCashflow).catch(() => setCashflow(null));
  }, [token, id, transactions]);
  useEffect(() => {
    if (account) setBank(account.currentBalance.toFixed(2));
  }, [account?.id, account?.currentBalance]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focusReconcile) window.setTimeout(() => document.getElementById('bank-says')?.focus(), 80);
  }, [focusReconcile, id]);

  const own = useMemo(() => transactions.filter((t) => t.userAccountId === id).sort((a, b) => b.date.localeCompare(a.date)), [transactions, id]);
  const range = useMemo(() => resolveRange('3m'), []);
  const series = useMemo(() => (account ? balanceSeries([account], own, range) : []), [account, own, range]);
  const soon = useMemo(() => upcoming.filter((o) => o.accountId === id || (account && o.toAccountName === account.accountName)).slice(0, 6), [upcoming, id, account]);
  const goal = goals.find((g) => g.accountId === id && g.isActive);

  if (!account) {
    return (
      <>
        <PageHead title="Account" />
        <Empty>{accounts.length ? 'This account does not exist any more.' : 'Loading…'} <a className="link" href={href('today')}>Back to Today</a></Empty>
      </>
    );
  }

  const value = Number.parseFloat(bank.replace(/['’\s]/g, '').replace(',', '.'));
  const diff = Number.isFinite(value) ? Math.round((value - account.currentBalance) * 100) / 100 : NaN;
  const last = account.lastReconciledAt;
  const since = last ? daysBetween(new Date(last), new Date()) : null;
  const stale = last === null || (since !== null && since >= RECONCILE_AFTER_DAYS);

  const reconcile = async () => {
    if (!token || !Number.isFinite(value)) return;
    setBusy(true); setError(null);
    try {
      await api.reconcileAccount(token, account.id, value, note.trim() || 'Abgleich');
      toast(Math.abs(diff) < 0.005 ? 'Marked as checked' : `Adjusted by ${formatSigned(diff)}`);
      setNote('');
      await refresh(['core']);
      if (focusReconcile) navigate('account', { id: account.id });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reconcile'); } finally { setBusy(false); }
  };
  const toggleSpending = async (on: boolean) => {
    if (!token) return;
    try { await api.updateAccount(token, account.id, { spending: on }); toast(on ? 'Counts toward safe to spend' : 'Left out of safe to spend'); await refresh(['core', 'planned']); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not save'); }
  };

  return (
    <>
      <PageHead title={account.accountName} sub={<>{account.currency}{account.spending === false ? ' · savings' : ' · spending account'}{goal ? <> · goal <a className="link" href={href('plan', { pot: goal.id })}>{goal.name} {Math.round(goal.percentage)}%</a></> : null}</>}>
        <button className="btn" onClick={() => setEntry(null)}>+ Entry</button>
        <a className="btn" href={href('import', { account: account.id })}>Import</a>
        <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
      </PageHead>

      <div className="grid">
        <Section span="span-7" title="Balance" action={<span className="tiny faint">last 3 months</span>}>
          <div className={`hero-value money ${account.currentBalance < 0 ? 'neg' : ''}`}>{formatSigned(account.currentBalance)}<span className="unit">{account.currency}</span></div>
          {account.currency !== CURRENCY ? <div className="small faint num money">≈ {formatAmount(account.baseBalance)} {CURRENCY}</div> : null}
          <div style={{ marginTop: 14 }}>
            {series.length > 1 ? <TrendLine data={series} name="Balance" currency={account.currency} height={200} /> : <Empty>Not enough history yet.</Empty>}
          </div>
        </Section>

        <Section span="span-5" title="My bank says" action={stale ? <Tag tone="accent">{last === null ? 'never checked' : `${since} d since check`}</Tag> : <Tag tone="pos">checked</Tag>}>
          <p className="small muted" style={{ marginBottom: 10 }}>
            {last ? <>Last checked {formatLongDate(last)} ({relativeDays(isoDay(new Date(last)))}).</> : last === null ? 'Never checked against the bank.' : 'The server does not report checks yet.'} Enter what the bank (or your wallet) shows; a difference is booked as an adjustment.
          </p>
          <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '0 0 160px' }}>
              <label className="caption" htmlFor="bank-says">Balance · {account.currency}</label>
              <input id="bank-says" className="input serif num" inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') reconcile(); }} />
            </div>
            <div className="field grow">
              <label className="caption">Note</label>
              <input className="input" placeholder="Abgleich" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <div className="row-between" style={{ marginTop: 10 }}>
            <span className="small">
              {Number.isFinite(diff) ? (Math.abs(diff) < 0.005 ? <span className="faint">Matches Sumry</span> : <>Adjustment <strong className={`num money ${diff > 0 ? 'pos' : 'neg'}`}>{formatSigned(diff)}</strong></>) : <span className="neg">Not a number</span>}
            </span>
            <button className="btn primary sm" onClick={reconcile} disabled={busy || !Number.isFinite(value)}>{busy ? 'Saving…' : Math.abs(diff) < 0.005 ? 'Mark as checked' : 'Reconcile'}</button>
          </div>
          <ErrorLine>{error}</ErrorLine>
          <div style={{ borderTop: '1px solid var(--rule)', marginTop: 14, paddingTop: 12 }}>
            <Switch checked={account.spending !== false} onChange={toggleSpending} label={<span>Counts toward safe to spend <span className="faint">(off for savings)</span></span>} />
          </div>
        </Section>

        <Section span="span-7" title="This month">
          <div className="stats">
            <Stat label="In" value={cashflow ? <span className="pos">{formatAmount(cashflow.income)}</span> : '…'} />
            <Stat label="Out" value={cashflow ? formatAmount(cashflow.expenses) : '…'} />
            <Stat label="Net" value={cashflow ? formatSigned(cashflow.income - cashflow.expenses) : '…'} foot={<span className="tiny faint">{own.filter((t) => t.date.slice(0, 7) === isoDay(new Date()).slice(0, 7)).length} entries</span>} />
          </div>
        </Section>

        <Section span="span-5" title="Coming up" action={<a className="link small" href={href('plan')}>Plan →</a>}>
          {soon.length ? (
            <div className="list tight">
              {soon.map((o) => (
                <div className="row-between small" key={`${o.plannedId}-${o.date}`}>
                  <span className="truncate"><span className={o.overdue ? 'neg' : 'faint'}>{o.overdue ? 'overdue' : formatShortDate(dayOf(o.date))}</span> · {o.name}</span>
                  <span className={`num money ${o.kind === 'INCOME' || o.toAccountName === account.accountName ? 'pos' : ''}`}>{o.kind === 'INCOME' || o.toAccountName === account.accountName ? '+' : '−'}{formatAmount(o.amount)}</span>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing planned on this account.</Empty>}
        </Section>

        <Section span="span-12" title={`Entries · ${own.length}`} action={<a className="link small" href={href('activity', { account: account.id })}>All in Activity →</a>}>
          <TxList transactions={own.slice(0, 25)} grouped showAccount={false} showBalance onOpen={setEntry} empty="No entries on this account yet." />
        </Section>
      </div>

      {editing ? <AccountEditor editing={account} onClose={() => setEditing(false)} /> : null}
      {entry !== undefined ? <TransactionEditor editing={entry} presetAccountId={account.id} onClose={() => setEntry(undefined)} /> : null}
    </>
  );
}
