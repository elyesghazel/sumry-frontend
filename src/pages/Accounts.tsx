import { useMemo, useState } from 'react';
import { cssVar, href, SERIES, useStore } from '../store';
import { Chips, Delta, Empty, Num, Section, Stat, Swatch, Tag } from '../ui';
import { MultiLine, Sparkline } from '../charts';
import {
  CURRENCY,
  formatAmount,
  signOf,
  accountDelta,
  balanceSeries,
  inRange,
  resolveRange,
  TIMEFRAMES,
  type Account,
} from '../../core';
import { AccountEditor, ReconcileEditor, TransactionEditor } from '../components/Editor';

export function Accounts() {
  const { accounts, transactions, goals, timeframe, setTimeframe } = useStore();
  const range = useMemo(() => resolveRange(timeframe), [timeframe]);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null | undefined>(undefined);
  const [transferFrom, setTransferFrom] = useState<string | null>(null);

  const colorFor = (i: number) => cssVar(SERIES[i % SERIES.length]);

  const perAccount = useMemo(
    () => accounts.map((a) => balanceSeries([a], transactions.filter((t) => t.userAccountId === a.id), range)),
    [accounts, transactions, range],
  );
  const series = useMemo(() => {
    const length = perAccount[0]?.length ?? 0;
    const rows: Record<string, string | number>[] = [];
    for (let i = 0; i < length; i++) {
      const row: Record<string, string | number> = { label: perAccount[0][i].label };
      accounts.forEach((a, ai) => { row[a.id] = perAccount[ai]?.[i]?.value ?? 0; });
      rows.push(row);
    }
    return rows;
  }, [accounts, perAccount]);

  const netWorth = accounts.reduce((s, a) => s + (a.baseBalance ?? a.currentBalance ?? 0), 0);
  const foreign = accounts.some((a) => a.currency !== CURRENCY);

  const activity = useMemo(() => {
    const map = new Map<string, { count: number; inn: number; out: number }>();
    for (const a of accounts) map.set(a.id, { count: 0, inn: 0, out: 0 });
    for (const tx of transactions) {
      if (!inRange(tx, range)) continue;
      const entry = map.get(tx.userAccountId ?? '');
      if (!entry) continue;
      entry.count += 1;
      if (signOf(tx.kind) > 0) entry.inn += tx.amount; else entry.out += tx.amount;
    }
    return map;
  }, [accounts, transactions, range]);

  const goalFor = (id: string) => goals.find((g) => g.accountId === id && g.isActive);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="sub">{accounts.length} accounts{foreign ? ` · converted to ${CURRENCY} at today's rate` : ''}</p>
        </div>
        <span className="row" style={{ gap: 8 }}>
          <Chips options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
          <button className="btn" onClick={() => setEditing(null)}>+ Account</button>
        </span>
      </div>

      <div className="grid">
        <Section span="span-4" title="Net worth">
          <div className="hero-value money"><Num value={netWorth} /><span className="unit">{CURRENCY}</span></div>
          <div style={{ marginTop: 12 }}>
            <Delta value={accounts.reduce((s, a) => s + accountDelta(a, transactions, range), 0)} suffix={`· ${range.label.toLowerCase()}`} />
          </div>
        </Section>

        <Section span="span-8" title="Balances">
          <div className="stats">
            {accounts.map((a, i) => (
              <Stat key={a.id} label={`${a.accountName}${a.currency !== CURRENCY ? ` · ${a.currency}` : ''}`} value={<Num value={a.currentBalance ?? 0} />}
                foot={<span className="row" style={{ gap: 10 }}><Sparkline data={perAccount[i]?.map((p) => p.value) ?? []} color={colorFor(i)} /><Delta value={accountDelta(a, transactions, range)} showUnit={false} /></span>} />
            ))}
          </div>
        </Section>

        <Section span="span-12" title="Over time">
          {series.length > 1 ? (
            <MultiLine data={series} currency={CURRENCY} height={300} series={accounts.map((a, i) => ({ key: a.id, name: a.accountName, color: colorFor(i) }))} />
          ) : <Empty>Not enough history in this period.</Empty>}
        </Section>

        <Section span="span-12" title="Detail">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>Account</th><th className="right">Entries</th><th className="right">In</th><th className="right">Out</th><th className="right">Change</th><th className="right">Balance</th><th className="right hide-sm">In {CURRENCY}</th><th></th></tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => {
                  const st = activity.get(a.id) ?? { count: 0, inn: 0, out: 0 };
                  const goal = goalFor(a.id);
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className="dot-row"><Swatch color={colorFor(i)} /><span>{a.accountName}</span>{a.currency !== CURRENCY ? <Tag>{a.currency}</Tag> : null}{a.spending === false ? <Tag>savings</Tag> : null}{goal ? <a className="tiny link" href={href('plan')}>goal · {Math.round(goal.percentage)}%</a> : null}</span>
                      </td>
                      <td className="right num faint">{st.count}</td>
                      <td className="right num pos money">{formatAmount(st.inn)}</td>
                      <td className="right num neg money">{formatAmount(st.out)}</td>
                      <td className="right"><Delta value={accountDelta(a, transactions, range)} showUnit={false} /></td>
                      <td className="right amount money">{formatAmount(a.currentBalance ?? 0)}</td>
                      <td className="right num faint hide-sm money">{formatAmount(a.baseBalance ?? a.currentBalance ?? 0)}</td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm ghost" onClick={() => setTransferFrom(a.id)}>Transfer</button>
                        <button className="btn sm ghost" onClick={() => setReconciling(a.id)} title="Set the real balance; the difference is booked">Adjust</button>
                        <button className="btn sm ghost" onClick={() => setEditing(a)}>Edit</button>
                        <a className="btn sm ghost" href={href('activity', { account: a.id })}>Entries</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {reconciling ? <ReconcileEditor accountId={reconciling} onClose={() => setReconciling(null)} /> : null}
      {editing !== undefined ? <AccountEditor editing={editing} onClose={() => setEditing(undefined)} /> : null}
      {transferFrom ? <TransactionEditor editing={null} presetAccountId={transferFrom} onClose={() => setTransferFrom(null)} /> : null}
    </>
  );
}
