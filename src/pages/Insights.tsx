import { useEffect, useMemo, useState } from 'react';
import { categoryColor, cssVar, href, navigate, useStore, type Route } from '../store';
import { BarRow, Chips, Delta, DeltaPercent, Empty, Num, Section, Segmented, Stat, Swatch, Tag } from '../ui';
import { PageHead } from '../components/Nav';
import { api } from '../api';
import { FlowSankey, Heatmap, MultiLine, PairedBars, TrendArea, TrendLine } from '../charts';
import {
  CURRENCY,
  formatAmount,
  isTransfer,
  signOf,
  baseOf,
  calendarHeat,
  categoryBreakdown,
  inRange,
  monthlySeries,
  pctChange,
  previousRange,
  resolveRange,
  sankeyData,
  spendBuckets,
  totals,
  yearOverYear,
  TIMEFRAMES,
  accountDelta,
  balanceSeries,
  categoryMovers,
  formatSigned,
  type Statement,
} from '../../core';

type Tab = 'overview' | 'statement';

/** How am I doing: the only place with a period picker, plus the monthly statement. */
export function Insights({ route }: { route: Route }) {
  const tab: Tab = route.params.get('tab') === 'statement' ? 'statement' : 'overview';
  const setTab = (t: Tab) => navigate('insights', t === 'statement' ? { tab: t } : undefined);
  return tab === 'statement' ? <StatementView month0={route.params.get('month')} setTab={setTab} /> : <Overview setTab={setTab} />;
}

function Overview({ setTab }: { setTab: (t: Tab) => void }) {
  const { transactions, categories, accounts, forecast, timeframe, setTimeframe, subscriptions } = useStore();
  const [selected, setSelected] = useState<string | null>(null);

  const range = useMemo(() => resolveRange(timeframe), [timeframe]);
  const prior = useMemo(() => previousRange(range), [range]);
  const now = useMemo(() => totals(transactions, range), [transactions, range]);
  const before = useMemo(() => totals(transactions, prior), [transactions, prior]);
  const byCategory = useMemo(() => categoryBreakdown(transactions, range), [transactions, range]);
  const months = useMemo(() => monthlySeries(transactions, 12), [transactions]);
  const categoryByLabel = useMemo(() => new Map(categories.map((c) => [c.label, c])), [categories]);
  const colorOf = (label: string) => categoryColor(label, categoryByLabel.get(label)?.color);

  const sankey = useMemo(() => sankeyData(transactions, range, (l) => categoryByLabel.get(l)?.parentGroup ?? null, colorOf), [transactions, range, categoryByLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const heat = useMemo(() => calendarHeat(transactions, 26), [transactions]);
  const yoy = useMemo(() => yearOverYear(transactions), [transactions]);
  const hasLastYear = yoy.some((p) => p.previous > 0);

  const focus = selected ?? byCategory[0]?.label ?? null;
  const focusSeries = useMemo(() => {
    if (!focus) return [];
    return spendBuckets(transactions.filter((t) => t.categoryLabel === focus), range).map((b) => ({ label: b.label, value: b.value }));
  }, [transactions, focus, range]);

  const weekday = useMemo(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sums = new Array(7).fill(0);
    for (const tx of transactions) {
      if (isTransfer(tx.kind) || signOf(tx.kind) > 0 || !inRange(tx, range)) continue;
      sums[new Date(tx.date).getDay()] += baseOf(tx);
    }
    return [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: names[i], value: sums[i] }));
  }, [transactions, range]);

  const paceData = useMemo(() => {
    const cur = spendBuckets(transactions, range);
    const prev = spendBuckets(transactions, prior);
    const len = Math.max(cur.length, prev.length);
    let a = 0, b = 0;
    const out: Record<string, string | number>[] = [];
    for (let i = 0; i < len; i++) {
      a += cur[i]?.value ?? 0;
      b += prev[i]?.value ?? 0;
      out.push({ label: String(i + 1), current: a, previous: b });
    }
    return out;
  }, [transactions, range, prior]);

  const totalSpend = byCategory.reduce((s, c) => s + c.value, 0);
  const movers = useMemo(() => categoryMovers(transactions, range, 6), [transactions, range]);
  const spend = useMemo(() => spendBuckets(transactions, range).map((b) => ({ label: b.label, value: b.value })), [transactions, range]);
  const balance = useMemo(() => balanceSeries(accounts, transactions, range), [accounts, transactions, range]);
  const netWorth = accounts.reduce((s, a) => s + (a.baseBalance ?? a.currentBalance ?? 0), 0);
  const netChange = accounts.reduce((s, a) => s + accountDelta(a, transactions, range), 0);
  const savingsRate = now.income > 0 ? (now.net / now.income) * 100 : null;

  return (
    <>
      <PageHead title="Insights" sub={`${range.label} · ${now.count} entries`}>
        <Segmented options={[{ key: 'overview', label: 'Overview' }, { key: 'statement', label: 'Statement' }]} value="overview" onChange={(v) => setTab(v as Tab)} />
      </PageHead>
      <div className="period-bar"><Chips options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} /></div>

      <div className="grid">
        <Section span="span-12">
          <div className="stats">
            <Stat label="Spent" value={<Num value={now.expense} />} foot={<DeltaPercent value={pctChange(now.expense, before.expense)} invert />} />
            <Stat label="Received" value={<Num value={now.income} />} foot={<DeltaPercent value={pctChange(now.income, before.income)} />} />
            <Stat label="Net" value={<Num value={now.net} format={(v) => `${v < 0 ? '−' : ''}${formatAmount(v)}`} />} foot={<Delta value={now.net} showUnit={false} />} />
            <Stat label="Per day" value={<Num value={now.expense / Math.max(1, range.days)} />} foot={<span className="tiny faint">over {range.days} days</span>} />
            <Stat label="Savings rate" value={savingsRate === null ? '—' : `${Math.round(savingsRate)}%`} foot={<span className="tiny faint">of income kept</span>} />
            <Stat label="Subscriptions" value={subscriptions ? <Num value={subscriptions.monthlyTotal} /> : '—'} foot={<span className="tiny faint">{subscriptions?.activeCount ?? 0} active · per month</span>} />
          </div>
        </Section>

        <Section span="span-7" title="Spending over time" action={<span className="tiny faint">{range.label.toLowerCase()}</span>}>
          {spend.some((x) => x.value > 0) ? <TrendArea data={spend} currency={CURRENCY} height={220} /> : <Empty>Nothing spent in this period.</Empty>}
        </Section>

        <Section span="span-5" title="Month end" action={forecast ? <Tag tone={forecast.verdict === 'over' ? 'neg' : forecast.verdict === 'under' ? 'pos' : ''}>{forecast.verdict === 'over' ? 'above usual' : forecast.verdict === 'under' ? 'below usual' : 'about usual'}</Tag> : null}>
          {forecast ? (
            <div className="list tight">
              <div className="row-between"><span className="muted">Spent so far</span><span className="num money">{formatAmount(forecast.spentSoFar)}</span></div>
              <div className="row-between"><span className="muted">Received so far</span><span className="num money pos">{formatAmount(forecast.incomeSoFar)}</span></div>
              <div className="row-between"><span className="muted">Still planned</span><span className="num money">{formatAmount(forecast.plannedExpensesRemaining)}</span></div>
              <div className="row-between"><span className="muted">Everyday, {forecast.daysLeft} d × {formatAmount(forecast.baselineDailyPace)}</span><span className="num money">{formatAmount(forecast.baselineDailyPace * forecast.daysLeft)}</span></div>
              <div className="row-between"><strong>Projected spend</strong><strong className="num money serif" style={{ fontSize: 18 }}>{formatAmount(forecast.projectedSpend)}</strong></div>
              <div className="row-between"><span className="muted">Projected income</span><span className="num money">{formatAmount(forecast.projectedIncome)}</span></div>
              <div className="row-between"><span className="muted">Projected net</span><span className={`num money ${forecast.projectedNet < 0 ? 'neg' : 'pos'}`}>{formatSigned(forecast.projectedNet)}</span></div>
              <div className="row-between tiny faint"><span>Pace now {formatAmount(forecast.currentDailyPace)}/day</span><span>Last month {formatAmount(forecast.lastMonthSpend)}{forecast.sameMonthLastYearSpend > 0 ? ` · last year ${formatAmount(forecast.sameMonthLastYearSpend)}` : ''}</span></div>
            </div>
          ) : <Empty>Loading…</Empty>}
        </Section>

        <Section span="span-7" title="Balance" action={<span className="small muted">net worth <strong className="num money">{formatAmount(netWorth)}</strong> {CURRENCY}</span>}>
          {balance.length > 1 ? <TrendLine data={balance} name="Balance" currency={CURRENCY} height={220} /> : <Empty>Not enough history in this period.</Empty>}
          <div style={{ marginTop: 8 }}><Delta value={netChange} suffix={`· ${range.label.toLowerCase()}`} /></div>
        </Section>

        <Section span="span-5" title="Moved most" action={<span className="tiny faint">vs previous period</span>}>
          {movers.length ? (
            <div className="list tight">
              {movers.map((m) => (
                <a className="row-between" key={m.label} href={href('activity', { category: m.label })}>
                  <span className="dot-row"><Swatch color={colorOf(m.label)} /><span className="truncate">{m.label}</span></span>
                  <Delta value={m.delta} invert showUnit={false} />
                </a>
              ))}
            </div>
          ) : <Empty>Nothing to compare yet.</Empty>}
        </Section>

        <Section span="span-12" title="Where the money flows" action={<span className="tiny faint">income → groups → categories</span>}>
          {sankey.links.length ? <FlowSankey data={sankey} currency={CURRENCY} height={Math.max(340, Math.min(640, sankey.nodes.length * 38))} /> : <Empty>Nothing in this period.</Empty>}
        </Section>

        <Section span="span-7" title="Pace vs previous period" action={<span className="tiny faint">cumulative spend by day of period</span>}>
          <MultiLine data={paceData} currency={CURRENCY} series={[{ key: 'current', name: 'This period', color: cssVar('--ink') }, { key: 'previous', name: 'Previous', color: cssVar('--ink-3'), dashed: true }]} />
        </Section>

        <Section span="span-5" title="By weekday">
          <TrendArea data={weekday} currency={CURRENCY} height={260} />
        </Section>

        <Section span="span-12" title="Every day, last six months" action={<span className="tiny faint">darker = more spent</span>}>
          <Heatmap cells={heat.cells} currency={CURRENCY} />
        </Section>

        <Section span="span-5" title="Where it goes" action={<span className="tiny faint">click to see its trend</span>}>
          <div className="list">
            {byCategory.slice(0, 10).map((c) => (
              <BarRow key={c.label} label={c.label} value={c.value} share={c.share} meta={`${c.count}×`} color={colorOf(c.label)} onClick={() => setSelected(c.label)} />
            ))}
            {byCategory.length === 0 ? <Empty>Nothing spent in this period.</Empty> : null}
          </div>
        </Section>

        <Section span="span-7" title={focus ? `${focus} over time` : 'Category over time'} action={focus ? <a className="link small" href={href('activity', { category: focus })}>Entries</a> : null}>
          {focus && focusSeries.some((s) => s.value > 0) ? (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <Swatch color={colorOf(focus)} />
                <span className="small muted">
                  <span className="num money">{formatAmount(byCategory.find((c) => c.label === focus)?.value ?? 0)}</span> {CURRENCY} · {Math.round(((byCategory.find((c) => c.label === focus)?.value ?? 0) / (totalSpend || 1)) * 100)}% of spending
                </span>
              </div>
              <TrendArea data={focusSeries} currency={CURRENCY} height={220} color={colorOf(focus)} name={focus} />
            </>
          ) : <Empty>Pick a category to see its trend.</Empty>}
        </Section>

        <Section span="span-7" title={hasLastYear ? 'This year against last' : 'Twelve months'} action={<span className="tiny faint">spend per month</span>}>
          {hasLastYear ? <PairedBars data={yoy} currency={CURRENCY} /> : <TrendLine data={months.map((m) => ({ label: m.label, value: m.expense }))} name="Spent" currency={CURRENCY} color={cssVar('--neg')} height={220} />}
        </Section>

        <Section span="span-5" title="Income vs expense" action={<span className="tiny faint">last twelve months</span>}>
          <div className="list tight">
            {months.slice(-6).reverse().map((m) => (
              <div className="row-between" key={m.key}>
                <span className="muted">{m.label}</span>
                <span className="row" style={{ gap: 14 }}>
                  <span className="num money pos small">+{formatAmount(m.income)}</span>
                  <span className="num money neg small">−{formatAmount(m.expense)}</span>
                  <strong className={`num money ${m.income - m.expense < 0 ? 'neg' : ''}`} style={{ width: 90, textAlign: 'right' }}>{m.income - m.expense < 0 ? '−' : ''}{formatAmount(m.income - m.expense)}</strong>
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}

// --------------------------------------------------------------- statement

function StatementView({ month0, setTab }: { month0: string | null; setTab: (t: Tab) => void }) {
  const { token, toast, user } = useStore();
  const last = new Date(); last.setMonth(last.getMonth() - 1);
  const [month, setMonth] = useState(month0 ?? `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`);
  const [s, setS] = useState<Statement | null>(null);
  const [mail, setMail] = useState<boolean | null>(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBusy(true);
    api.statement(token, month).then((r) => { if (!cancelled) setS(r); }).catch(() => { if (!cancelled) setS(null); }).finally(() => { if (!cancelled) setBusy(false); });
    api.mailStatus(token).then((m) => setMail(m.configured)).catch(() => setMail(false));
    return () => { cancelled = true; };
  }, [token, month]);

  const send = async () => {
    if (!token) return;
    setSending(true);
    try { const r = await api.sendStatement(token, month, to.trim() || undefined); toast(`Sent to ${r.sentTo}`); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not send'); }
    finally { setSending(false); }
  };
  const openHtml = async () => {
    if (!token) return;
    const html = await api.statementHtml(token, month);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHead title="Statement" sub={label}>
        <Segmented options={[{ key: 'overview', label: 'Overview' }, { key: 'statement', label: 'Statement' }]} value="statement" onChange={(v) => setTab(v as Tab)} />
      </PageHead>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} aria-label="Month" />
        <button className="btn" onClick={openHtml}>Open as page</button>
        <span className="grow" />
        <input className="input" type="email" placeholder={user?.email ?? 'your address'} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 220 }} aria-label="Send to" />
        <button className="btn primary" onClick={send} disabled={mail === false || sending}>{sending ? 'Sending…' : 'Email it'}</button>
      </div>
      {mail === false ? <p className="tiny faint">Email is off: the API has no SMTP configured. The statement still works here.</p> : null}
      {busy && !s ? <Empty>Loading…</Empty> : s ? (
        <div className="grid">
          <Section span="span-4" title="Net">
            <div className={`hero-value money ${s.net < 0 ? 'neg' : ''}`}>{s.net < 0 ? '−' : '+'}{formatAmount(s.net)}<span className="unit">{s.baseCurrency}</span></div>
            <div className="list tight" style={{ marginTop: 12 }}>
              <div className="row-between"><span className="muted">In</span><span className="num money pos">{formatAmount(s.income)}</span></div>
              <div className="row-between"><span className="muted">Out</span><span className="num money">{formatAmount(s.expense)}</span></div>
              <div className="row-between"><span className="muted">Saved</span><span className="num">{s.savingsRate !== null ? `${Math.round(s.savingsRate * 100)}%` : '—'}</span></div>
              <div className="row-between tiny faint"><span>Previous month</span><span className="num money">{formatAmount(s.previousIncome)} in · {formatAmount(s.previousExpense)} out</span></div>
              <div className="row-between"><span className="muted">Net worth</span><span className="num money">{formatAmount(s.netWorth)} <span className="tiny faint">({formatSigned(s.netWorthChange)})</span></span></div>
              <div className="row-between tiny faint"><span>{s.entryCount} entries</span><span>subscriptions {formatAmount(s.subscriptionsMonthly)}/mo</span></div>
            </div>
          </Section>
          <Section span="span-4" title="Where it went">
            <div className="list tight">
              {s.byCategory.map((c) => <div className="row-between" key={c.label}><span className="dot-row"><Swatch color={c.color ?? categoryColor(c.label)} /><span className="truncate">{c.label}</span></span><span className="num money small">{formatAmount(c.amount)} <span className="faint">{Math.round(c.share * 100)}%</span></span></div>)}
              {!s.byCategory.length ? <Empty>Nothing spent.</Empty> : null}
            </div>
          </Section>
          <Section span="span-4" title="Largest">
            <div className="list tight">
              {s.largest.map((e, i) => <div className="row-between" key={i}><span className="truncate"><span className="faint">{new Date(e.date).getDate()}.</span> {e.description ?? e.category}</span><span className="num money small">{formatAmount(e.amount)}</span></div>)}
            </div>
            {s.budgets.length ? <>
              <div className="caption" style={{ margin: '14px 0 6px' }}>Budgets</div>
              <div className="list tight">{s.budgets.map((b) => <div className="row-between" key={b.category}><span>{b.category}</span><span className={`num money small ${b.over ? 'neg' : ''}`}>{formatAmount(b.spent)} / {formatAmount(b.limit)}</span></div>)}</div>
            </> : null}
            {s.accounts.length ? <>
              <div className="caption" style={{ margin: '14px 0 6px' }}>Accounts</div>
              <div className="list tight">{s.accounts.map((a) => <div className="row-between" key={a.name}><span>{a.name}</span><span className="num money small">{formatAmount(a.balance)} <span className="faint">{formatSigned(a.change)}</span></span></div>)}</div>
            </> : null}
          </Section>
        </div>
      ) : <Empty>No statement for this month.</Empty>}
    </>
  );
}
