import { useMemo, useState } from 'react';
import { categoryColor, cssVar, href, useStore } from '../store';
import { BarRow, Chips, Delta, DeltaPercent, Empty, Num, Section, Stat, Swatch } from '../ui';
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
} from '../../core';

/** The deeper cut: flows, rhythms, per-category trends and running comparisons. */
export function Insights() {
  const { transactions, categories, timeframe, setTimeframe, subscriptions } = useStore();
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
  const savingsRate = now.income > 0 ? (now.net / now.income) * 100 : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <p className="sub">{range.label} · {now.count} entries</p>
        </div>
        <Chips options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} />
      </div>

      <div className="grid">
        <Section span="span-12">
          <div className="stats">
            <Stat label="Spent" value={<Num value={now.expense} />} foot={<DeltaPercent value={pctChange(now.expense, before.expense)} invert />} />
            <Stat label="Received" value={<Num value={now.income} />} foot={<DeltaPercent value={pctChange(now.income, before.income)} />} />
            <Stat label="Net" value={<Num value={now.net} format={(v) => `${v < 0 ? '−' : ''}${formatAmount(v)}`} />} foot={<Delta value={now.net} showUnit={false} />} />
            <Stat label="Savings rate" value={savingsRate === null ? '—' : `${Math.round(savingsRate)}%`} foot={<span className="tiny faint">of income kept</span>} />
            <Stat label="Subscriptions" value={subscriptions ? <Num value={subscriptions.monthlyTotal} /> : '—'} foot={<span className="tiny faint">{subscriptions?.activeCount ?? 0} active · per month</span>} />
          </div>
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

        <Section span="span-5" title="Category breakdown" action={<span className="tiny faint">click to focus</span>}>
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
