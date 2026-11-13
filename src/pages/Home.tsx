import { useMemo, useState } from 'react';
import { useStore, categoryColor, cssVar, href } from '../store';
import { BarRow, Chips, Delta, DeltaPercent, Empty, Meter, Num, Section, Stat, Swatch, Tag } from '../ui';
import { CategoryBars, TrendArea, TrendLine } from '../charts';
import {
  CURRENCY,
  formatAmount,
  formatDayHeading,
  isTransfer,
  relativeDays,
  signOf,
  baseOf,
  accountDelta,
  balanceSeries,
  categoryBreakdown,
  categoryMovers,
  pctChange,
  previousRange,
  resolveRange,
  spendBuckets,
  totals,
  TIMEFRAMES,
  type Transaction,
} from '../../core';
import { TransactionEditor } from '../components/Editor';
import { api } from '../api';

export function Home() {
  const { accounts, categories, transactions, progress, safe, forecast, upcoming, timeframe, setTimeframe, token, refresh, toast } = useStore();
  const [editor, setEditor] = useState<Transaction | null | undefined>(undefined);

  const range = useMemo(() => resolveRange(timeframe), [timeframe]);
  const prior = useMemo(() => previousRange(range), [range]);
  const now = useMemo(() => totals(transactions, range), [transactions, range]);
  const before = useMemo(() => totals(transactions, prior), [transactions, prior]);

  const netWorth = accounts.reduce((s, a) => s + (a.baseBalance ?? a.currentBalance ?? 0), 0);
  const netChange = accounts.reduce((s, a) => s + accountDelta(a, transactions, range), 0);

  const balance = useMemo(() => balanceSeries(accounts, transactions, range), [accounts, transactions, range]);
  const spend = useMemo(() => spendBuckets(transactions, range).map((b) => ({ label: b.label, value: b.value })), [transactions, range]);
  const byCategory = useMemo(() => categoryBreakdown(transactions, range), [transactions, range]);
  const movers = useMemo(() => categoryMovers(transactions, range, 4), [transactions, range]);
  const categoryByLabel = useMemo(() => new Map(categories.map((c) => [c.label, c])), [categories]);
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.accountName])), [accounts]);

  const ranked = useMemo(() => {
    const top = byCategory.slice(0, 8).map((c) => ({ label: c.label, value: c.value, color: categoryColor(c.label, categoryByLabel.get(c.label)?.color) }));
    const rest = byCategory.slice(8);
    if (rest.length) top.push({ label: `Other (${rest.length})`, value: rest.reduce((s, c) => s + c.value, 0), color: cssVar('--ink-3') });
    return top;
  }, [byCategory, categoryByLabel]);

  const recent = useMemo(() => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8), [transactions]);
  const soon = useMemo(() => upcoming.filter((o) => !o.overdue).slice(0, 6), [upcoming]);
  const overdue = useMemo(() => upcoming.filter((o) => o.overdue), [upcoming]);
  const perDay = now.expense / Math.max(1, range.days);

  const bookNow = async (id: string) => {
    if (!token) return;
    try {
      await api.bookPlanned(token, id);
      toast('Booked');
      await refresh(['core', 'planned', 'budgets', 'insights']);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not book');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <p className="sub">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Chips options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
      </div>

      <div className="grid">
        {/* Headline: what is actually free to spend before the next salary. */}
        <Section span="span-5" title="Safe to spend" action={safe ? <span className="tiny faint">until {relativeDays(safe.horizon)} · {safe.horizonReason}</span> : null}>
          {safe ? (
            <>
              <div className={`hero-value money ${safe.safeToSpend < 0 ? 'neg' : ''}`}>
                <Num value={safe.safeToSpend} />
                <span className="unit">{CURRENCY}</span>
              </div>
              <div className="row wrap" style={{ gap: 18, marginTop: 14 }}>
                <span className="small muted"><strong className="num money">{formatAmount(safe.perDay)}</strong> per day for {safe.daysToHorizon} days</span>
                <span className="small muted">{formatAmount(safe.balance)} on hand − {formatAmount(safe.upcomingExpenses + safe.upcomingTransfersOut)} committed{accounts.some((a) => a.spending === false) ? ' · savings left out' : ''}</span>
              </div>
            </>
          ) : <Empty>Loading…</Empty>}
        </Section>

        <Section span="span-7" title={`This period · ${range.label.toLowerCase()}`}>
          <div className="stats">
            <Stat label="Spent" value={<Num value={now.expense} />} foot={<DeltaPercent value={pctChange(now.expense, before.expense)} invert />} />
            <Stat label="Received" value={<Num value={now.income} />} foot={<DeltaPercent value={pctChange(now.income, before.income)} />} />
            <Stat label="Net" value={<Num value={now.net} format={(v) => `${v < 0 ? '−' : ''}${formatAmount(v)}`} />} foot={<Delta value={now.net} showUnit={false} />} />
            <Stat label="Per day" value={<Num value={perDay} />} foot={<span className="tiny faint">{now.count} entries</span>} />
          </div>
          <div style={{ marginTop: 18 }}>
            {spend.some((s) => s.value > 0) ? <TrendArea data={spend} currency={CURRENCY} height={120} /> : <Empty>Nothing spent in this period.</Empty>}
          </div>
        </Section>

        <Section span="span-4" title="Month end" action={forecast ? <Tag tone={forecast.verdict === 'over' ? 'neg' : forecast.verdict === 'under' ? 'pos' : ''}>{forecast.verdict === 'over' ? 'above usual' : forecast.verdict === 'under' ? 'below usual' : 'on the usual'}</Tag> : null}>
          {forecast ? (
            <div className="list tight">
              <div className="row-between"><span className="muted">Spent so far</span><span className="num money">{formatAmount(forecast.spentSoFar)}</span></div>
              <div className="row-between"><span className="muted">Still planned</span><span className="num money">{formatAmount(forecast.plannedExpensesRemaining)}</span></div>
              <div className="row-between"><span className="muted">Everyday, {forecast.daysLeft} days × {formatAmount(forecast.baselineDailyPace)}</span><span className="num money">{formatAmount(forecast.baselineDailyPace * forecast.daysLeft)}</span></div>
              <div className="row-between"><strong>Projected spend</strong><strong className="num money serif" style={{ fontSize: 18 }}>{formatAmount(forecast.projectedSpend)}</strong></div>
              <div className="row-between"><span className="muted">Projected net</span><span className={`num money ${forecast.projectedNet < 0 ? 'neg' : 'pos'}`}>{forecast.projectedNet < 0 ? '−' : '+'}{formatAmount(forecast.projectedNet)}</span></div>
              <div className="row-between tiny faint"><span>Last month {formatAmount(forecast.lastMonthSpend)}</span><span>{forecast.sameMonthLastYearSpend > 0 ? `Same month last year ${formatAmount(forecast.sameMonthLastYearSpend)}` : ''}</span></div>
            </div>
          ) : <Empty>Loading…</Empty>}
        </Section>

        <Section span="span-4" title="Upcoming" action={<a className="link small" href={href('plan')}>Plan</a>}>
          {overdue.length ? (
            <div className="list tight">
              {overdue.map((o) => (
                <div className="row-between" key={`${o.plannedId}-${o.date}`}>
                  <span className="dot-row"><Tag tone="neg">overdue</Tag><span className="truncate">{o.name}</span></span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="num money">{formatAmount(o.amount)}</span>
                    {!o.autoBook ? <button className="btn sm" onClick={() => bookNow(o.plannedId)}>Book</button> : null}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {soon.length ? (
            <div className="list tight">
              {soon.map((o) => (
                <div className="row-between" key={`${o.plannedId}-${o.date}`}>
                  <span className="dot-row">
                    <span className="tiny faint" style={{ width: 66 }}>{relativeDays(o.date)}</span>
                    <span className="truncate">{o.name}</span>
                  </span>
                  <span className={`num money ${o.kind === 'INCOME' ? 'pos' : ''}`}>{o.kind === 'INCOME' ? '+' : o.kind === 'TRANSFER_OUT' ? '' : '−'}{formatAmount(o.amount)}</span>
                </div>
              ))}
            </div>
          ) : !overdue.length ? <Empty>Nothing planned for the next weeks. Add rent, salary and subscriptions under Plan.</Empty> : null}
        </Section>

        <Section span="span-4" title="Budgets" action={<a className="link small" href={href('budgets')}>All</a>}>
          {progress.length ? (
            <div className="list">
              {progress.slice(0, 5).map((p) => (
                <div key={p.budgetId}>
                  <div className="row-between" style={{ marginBottom: 5 }}>
                    <span className="truncate">{p.categoryLabel}</span>
                    <span className={`num money small ${p.pace === 'over' ? 'neg' : 'muted'}`}>{formatAmount(p.spentAmount)} / {formatAmount(p.effectiveLimit)}</span>
                  </div>
                  <Meter ratio={p.effectiveLimit > 0 ? p.spentAmount / p.effectiveLimit : 1} tone={p.pace === 'over' ? 'over' : p.pace === 'on' ? 'warn' : 'ok'} />
                </div>
              ))}
            </div>
          ) : <Empty>No budgets yet.</Empty>}
        </Section>

        <Section span="span-7" title="Balance">
          {balance.length > 1 ? <TrendLine data={balance} name="Balance" currency={CURRENCY} /> : <Empty>Not enough history in this period.</Empty>}
          <div className="row wrap" style={{ gap: 18, marginTop: 10 }}>
            <span className="small muted">Net worth <strong className="num money">{formatAmount(netWorth)}</strong> {CURRENCY}</span>
            <Delta value={netChange} suffix={`· ${range.label.toLowerCase()}`} />
          </div>
        </Section>

        <Section span="span-5" title="Where it goes" action={<span className="tiny faint">click a bar to filter</span>}>
          {ranked.length ? (
            <CategoryBars data={ranked} currency={CURRENCY} height={Math.max(160, ranked.length * 30)} onSelect={(label) => { if (!label.startsWith('Other')) window.location.hash = href('activity', { category: label }); }} />
          ) : <Empty>Nothing spent in this period.</Empty>}
        </Section>

        <Section span="span-4" title="Moved most" action={<span className="tiny faint">vs previous period</span>}>
          {movers.length ? (
            <div className="list">
              {movers.map((m) => (
                <div className="row-between" key={m.label}>
                  <span className="dot-row"><Swatch color={categoryColor(m.label, categoryByLabel.get(m.label)?.color)} /><span className="truncate">{m.label}</span></span>
                  <Delta value={m.delta} invert showUnit={false} />
                </div>
              ))}
            </div>
          ) : <Empty>Nothing to compare yet.</Empty>}
        </Section>

        <Section span="span-4" title="Accounts" action={<a className="link small" href={href('accounts')}>All</a>}>
          <div className="list tight">
            {accounts.map((a) => (
              <div className="row-between" key={a.id}>
                <span className="truncate">{a.accountName}{a.currency !== CURRENCY ? <span className="faint tiny"> · {a.currency}</span> : null}</span>
                <span className="num money">{formatAmount(a.currentBalance ?? 0)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section span="span-4" title="Top categories">
          <div className="list">
            {byCategory.slice(0, 4).map((c) => (
              <BarRow key={c.label} label={c.label} value={c.value} share={c.share} color={categoryColor(c.label, categoryByLabel.get(c.label)?.color)} meta={`${c.count}×`} onClick={() => { window.location.hash = href('activity', { category: c.label }); }} />
            ))}
            {!byCategory.length ? <Empty>Nothing spent in this period.</Empty> : null}
          </div>
        </Section>

        <Section span="span-12" title="Recent" action={<span className="row" style={{ gap: 10 }}><button className="btn sm" onClick={() => setEditor(null)}>+ New</button><a className="link small" href={href('activity')}>All activity</a></span>}>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Category</th><th>Note</th><th className="hide-sm">Account</th><th className="right">Amount</th></tr>
              </thead>
              <tbody>
                {recent.map((tx) => {
                  const transfer = isTransfer(tx.kind);
                  const sign = signOf(tx.kind);
                  return (
                    <tr key={tx.id} className="click" onClick={() => setEditor(tx)}>
                      <td className="faint small" style={{ whiteSpace: 'nowrap' }}>{formatDayHeading(new Date(tx.date))}</td>
                      <td>
                        <span className="dot-row">
                          <Swatch color={transfer ? cssVar('--ink-3') : categoryColor(tx.categoryLabel ?? '', categoryByLabel.get(tx.categoryLabel ?? '')?.color)} />
                          {transfer ? (tx.kind === 'TRANSFER_OUT' ? 'Transfer out' : 'Transfer in') : (tx.categoryLabel ?? 'Uncategorised')}
                        </span>
                      </td>
                      <td className="muted truncate" style={{ maxWidth: 260 }}>{tx.description ?? '—'}</td>
                      <td className="faint hide-sm">{accountName.get(tx.userAccountId ?? '') ?? '—'}</td>
                      <td className={`right amount money ${transfer ? 'faint' : sign > 0 ? 'pos' : ''}`}>
                        {sign > 0 ? '+' : '−'}{formatAmount(tx.amount)}{tx.currency !== CURRENCY ? <span className="tiny faint"> {tx.currency}</span> : null}
                        {tx.currency !== CURRENCY ? <div className="tiny faint">{formatAmount(baseOf(tx))} {CURRENCY}</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {editor !== undefined ? <TransactionEditor editing={editor} onClose={() => setEditor(undefined)} /> : null}
    </>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 11) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
